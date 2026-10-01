import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringStateApprovalModelTests: XCTestCase {
    private func fixture(
        action: RecurringStateInput.Action = .pause, loseReply: Bool = false
    ) async throws -> RecurringStateApprovalTestFixture {
        let fixture = try await RecurringStateApprovalTestFixture.make(action: action, loseReply: loseReply)
        let url = fixture.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return fixture
    }

    func testPauseAndCancellationRequireExplicitChoiceAndExactDecision() async throws {
        for action in [RecurringStateInput.Action.pause, .cancel] {
            for approved in [true, false] {
                let fixture = try await fixture(action: action)
                let view = await fixture.presentation()
                await view.load()
                XCTAssertEqual(view.proposal?.status, .pending)
                XCTAssertEqual(view.rule?.configuration.amountCentimes?.value, 101)
                let before = await fixture.server.writes
                XCTAssertEqual(before, 0)
                await view.decide(approved)
                XCTAssertEqual(view.saved?.decision.approved, approved)
                XCTAssertEqual(view.saved?.result?.approval.status, approved ? .consumed : .denied)
                let expected: RecurringRule.Status? = approved ? (action == .pause ? .paused : .cancelled) : nil
                XCTAssertEqual(view.saved?.result?.approval.receipt?.status, expected)
                let after = await fixture.server.writes
                XCTAssertEqual(after, 1)
                let finished = await view.finish()
                XCTAssertTrue(finished)
            }
        }
    }

    func testLostApprovalAndDenialRepliesSurviveRestartWithoutAnotherWrite() async throws {
        for action in [RecurringStateInput.Action.pause, .cancel] {
            for approved in [true, false] {
                let fixture = try await fixture(action: action, loseReply: true)
                let view = await fixture.presentation()
                await view.load()
                await view.decide(approved)
                let saved = try XCTUnwrap(view.saved)
                XCTAssertFalse(saved.isTerminal)
                XCTAssertNotNil(view.notice)
                let session = try await fixture.reopenedSession()
                let reopened = RecurringStateApprovalModel(
                    session: session, member: fixture.member, approvalId: saved.decision.approvalId)
                await reopened.load()
                XCTAssertEqual(reopened.saved?.decision, saved.decision)
                XCTAssertEqual(reopened.saved?.reviewedRule, saved.reviewedRule)
                await reopened.retry()
                XCTAssertEqual(reopened.saved?.result?.approval.status, approved ? .consumed : .denied)
                let writes = await fixture.server.writes
                XCTAssertEqual(writes, 1)
            }
        }
    }

    func testOfflineAndChangedRulePreflightCannotJournalOrConfirmANewDecision() async throws {
        for offline in [true, false] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            if offline { await fixture.server.goOffline() } else { await fixture.server.changeRule() }
            await view.decide(true)
            XCTAssertNil(view.saved)
            let stored = try await fixture.session.savedRecurringStateDecision(fixture.session.expenseContext())
            XCTAssertNil(stored)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            XCTAssertNotNil(view.notice)
            if !offline {
                await view.load()
                await view.decide(false)
                XCTAssertEqual(view.saved?.result?.approval.status, .denied)
            }
        }
    }

    func testExpiredUnusedDecisionFinishesWithoutPostingButConsumptionRaceRequiresRecheck() async throws {
        for consume in [false, true] {
            let fixture = try await fixture(action: .cancel)
            let context = try fixture.session.expenseContext()
            let input = await fixture.server.decision
            try await fixture.session.stageRecurringStateDecision(input, context: context)
            await fixture.server.expire(consume: consume)
            let view = await fixture.presentation()
            await view.load()
            await view.retry()
            if consume {
                XCTAssertFalse(view.saved?.isTerminal == true)
                XCTAssertNil(view.saved?.expiry)
                await view.retry()
                XCTAssertEqual(view.saved?.result?.approval.status, .consumed)
            } else {
                XCTAssertTrue(view.saved?.expiry?.expiredUnused == true)
            }
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            let finished = await view.finish()
            XCTAssertTrue(finished)
        }
    }

    func testChangedRuleAfterStagingKeepsTheExactUnresolvedDecision() async throws {
        let fixture = try await fixture()
        let context = try fixture.session.expenseContext()
        let input = await fixture.server.decision
        try await fixture.session.stageRecurringStateDecision(input, context: context)
        await fixture.server.changeRule()
        let view = await fixture.presentation()
        await view.load()
        await view.retry()
        XCTAssertEqual(view.saved?.decision, input)
        XCTAssertFalse(view.saved?.isTerminal == true)
        let finished = await view.finish()
        XCTAssertFalse(finished)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
        await fixture.server.expire()
        await view.retry()
        XCTAssertTrue(view.saved?.expiry?.expiredUnused == true)
    }

    func testDelayedPreflightCannotStageAfterSignOutOrMemberSwitch() async throws {
        for switchMember in [false, true] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            await fixture.server.pauseNextRead()
            let decide = Task { await view.decide(true) }
            await fixture.server.waitForRead()
            if switchMember {
                await fixture.session.signIn(idToken: "B", nonce: "fixture")
            } else {
                await fixture.session.signOut()
            }
            await fixture.server.releaseRead()
            await decide.value
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            XCTAssertNil(view.saved)
            XCTAssertNil(view.proposal)
            XCTAssertNil(view.rule)
            if switchMember {
                let pending = try await fixture.session.savedRecurringStateDecision(fixture.session.expenseContext())
                XCTAssertNil(pending)
            }
        }
    }
}
