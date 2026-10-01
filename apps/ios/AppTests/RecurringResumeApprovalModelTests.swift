import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringResumeApprovalModelTests: XCTestCase {
    private func fixture(
        variable: Bool = false, loseReply: Bool = false
    ) async throws -> RecurringResumeApprovalTestFixture {
        let fixture = try await RecurringResumeApprovalTestFixture.make(loseReply: loseReply, variable: variable)
        let url = fixture.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return fixture
    }

    func testFixedAndVariableResumptionRequireExplicitChoiceAndExactDecision() async throws {
        for variable in [false, true] {
            for approved in [true, false] {
                let fixture = try await fixture(variable: variable)
                let view = await fixture.presentation()
                await view.load()
                XCTAssertEqual(view.proposal?.status, .pending)
                XCTAssertEqual(view.rule?.configuration.amountCentimes?.value, variable ? nil : 101)
                let before = await fixture.server.writes
                XCTAssertEqual(before, 0)
                await view.decide(approved)
                XCTAssertEqual(view.saved?.decision.approved, approved)
                XCTAssertEqual(view.saved?.result?.approval.status, approved ? .consumed : .denied)
                let expected: RecurringRule.Status? = approved ? .active : nil
                XCTAssertEqual(view.saved?.result?.approval.receipt?.status, expected)
                let after = await fixture.server.writes
                XCTAssertEqual(after, 1)
                let finished = await view.finish()
                XCTAssertTrue(finished)
            }
        }
    }

    func testLostApprovalAndDenialRepliesSurviveRestartWithoutAnotherWrite() async throws {
        for variable in [false, true] {
            for approved in [true, false] {
                let fixture = try await fixture(variable: variable, loseReply: true)
                let view = await fixture.presentation()
                await view.load()
                await view.decide(approved)
                let saved = try XCTUnwrap(view.saved)
                XCTAssertFalse(saved.isTerminal)
                XCTAssertNotNil(view.notice)
                let session = try await fixture.reopenedSession()
                let reopened = RecurringResumeApprovalModel(
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
            let stored = try await fixture.session.savedRecurringResumeDecision(fixture.session.expenseContext())
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
            let fixture = try await fixture()
            let context = try fixture.session.expenseContext()
            let input = await fixture.server.decision
            try await fixture.session.stageRecurringResumeDecision(input, context: context)
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
        try await fixture.session.stageRecurringResumeDecision(input, context: context)
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
                let pending = try await fixture.session.savedRecurringResumeDecision(fixture.session.expenseContext())
                XCTAssertNil(pending)
            }
        }
    }

    func testPassedDateAndCoveredFirstCycleBlockNewApprovedIntentButAllowDecline() async throws {
        for datePassed in [true, false] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            if datePassed { await fixture.server.advanceDay() } else { await fixture.server.coverFuture() }
            await view.decide(true)
            XCTAssertNil(view.saved)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            await view.load()
            await view.decide(false)
            XCTAssertEqual(view.saved?.result?.approval.status, .denied)
        }
    }

    func testFencedPassedDateRecoversApprovedIntentWithoutWriteWhileDeclineStillExecutes() async throws {
        for approved in [true, false] {
            let fixture = try await fixture()
            let context = try fixture.session.expenseContext()
            let original = await fixture.server.decision
            let input = RecurringResumeDecision(
                operationId: original.operationId, approvalId: original.approvalId,
                change: original.change, approved: approved)
            try await fixture.session.stageRecurringResumeDecision(input, context: context)
            await fixture.server.advanceDay()
            let session = try await fixture.reopenedSession()
            let view = RecurringResumeApprovalModel(
                session: session, member: fixture.member, approvalId: input.approvalId)
            await view.load()
            XCTAssertFalse(view.saved?.isTerminal == true)
            await view.retry()
            XCTAssertEqual(view.saved?.datePassedUnused, approved)
            XCTAssertTrue(view.saved?.isTerminal == true)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, approved ? 0 : 1)
            XCTAssertEqual(view.saved?.result?.approval.status, approved ? .pending : .denied)
            let finished = await view.finish()
            XCTAssertTrue(finished)
        }
    }
}
