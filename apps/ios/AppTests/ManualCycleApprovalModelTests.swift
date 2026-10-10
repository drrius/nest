import Foundation
import XCTest

@testable import Nest

@MainActor
final class ManualCycleApprovalModelTests: XCTestCase {
    private func fixture(
        loseReply: Bool = false
    ) async throws -> ManualCycleApprovalTestFixture {
        let fixture = try await ManualCycleApprovalTestFixture.make(loseReply: loseReply)
        let url = fixture.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return fixture
    }

    func testLinkRequiresExplicitChoiceAndLinksOnlyTheReviewedCycle() async throws {
        for approved in [true, false] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            XCTAssertEqual(view.proposal?.status, .pending)
            XCTAssertEqual(view.proposalContext?.detail.event.amountCentimes.value, 101)
            XCTAssertEqual(view.proposalContext?.target.rule.configuration.amountCentimes?.value, 990)
            let before = await fixture.server.writes
            XCTAssertEqual(before, 0)
            await view.decide(approved)
            XCTAssertEqual(view.saved?.decision.approved, approved)
            XCTAssertEqual(view.saved?.result?.approval.status, approved ? .consumed : .denied)
            let receipt = view.saved?.result?.approval.receipt
            XCTAssertEqual(receipt?.linkedExpense.event.amountCentimes.value, approved ? 101 : nil)
            XCTAssertEqual(receipt?.configuration.mode, approved ? .fixed : nil)
            let after = await fixture.server.writes
            XCTAssertEqual(after, 1)
            let finished = await view.finish()
            XCTAssertTrue(finished)
        }
    }

    func testLostApprovalAndDenialRepliesSurviveRestartWithoutAnotherWrite() async throws {
        for approved in [true, false] {
            let fixture = try await fixture(loseReply: true)
            let view = await fixture.presentation()
            await view.load()
            await view.decide(approved)
            let saved = try XCTUnwrap(view.saved)
            XCTAssertFalse(saved.isTerminal)
            XCTAssertNotNil(view.notice)
            let session = try await fixture.reopenedSession()
            let reopened = ManualCycleApprovalModel(
                session: session, member: fixture.member, approvalId: saved.decision.approvalId)
            await reopened.load()
            XCTAssertEqual(reopened.saved?.decision, saved.decision)
            XCTAssertEqual(reopened.saved?.reviewedContext.target.rule, saved.reviewedContext.target.rule)
            await reopened.retry()
            XCTAssertEqual(reopened.saved?.result?.approval.status, approved ? .consumed : .denied)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 1)
        }
    }

    func testOfflineAndChangedRulePreflightCannotJournalOrConfirmANewDecision() async throws {
        for fault in ["offline", "expired", "revision", "covered", "member", "linked", "reversed", "future", "paused"] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            if fault == "expired" {
                await fixture.server.expire()
            } else if ["revision", "covered", "linked", "reversed"].contains(fault) {
                await fixture.server.change(fault)
            } else {
                await fixture.server.setFault(fault)
            }
            await view.decide(true)
            XCTAssertNil(view.saved)
            let stored = try await fixture.session.savedManualCycleDecision(fixture.session.expenseContext())
            XCTAssertNil(stored)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            XCTAssertNotNil(view.notice)
            if !["offline", "expired"].contains(fault) {
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
            try await fixture.session.stageManualCycleDecision(input, context: context)
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

    func testChangedRuleOrCoveredCycleRetiresOnlyAfterAFencedUnusedRead() async throws {
        for fault in ["revision", "covered", "linked", "reversed"] {
            let fixture = try await fixture()
            let context = try fixture.session.expenseContext()
            let input = await fixture.server.decision
            try await fixture.session.stageManualCycleDecision(input, context: context)
            await fixture.server.change(fault, failFence: true)
            let view = await fixture.presentation()
            await view.load()
            await view.retry()
            XCTAssertEqual(view.saved?.decision, input)
            XCTAssertFalse(view.saved?.isTerminal == true)
            XCTAssertNil(view.saved?.conflict)
            let unresolved = await view.finish()
            XCTAssertFalse(unresolved)
            await view.retry()
            XCTAssertTrue(view.saved?.isTerminal == true)
            XCTAssertNotNil(view.saved?.conflict)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            let finished = await view.finish()
            XCTAssertTrue(finished)
            await view.load()
            await view.decide(false)
            XCTAssertEqual(view.saved?.result?.approval.status, .denied)
            let denied = await fixture.server.writes
            XCTAssertEqual(denied, 1)
        }
    }

    func testRecordedResultWinsWhenExecutionCompletesBeforeTheFencedReread() async throws {
        let fixture = try await fixture()
        let context = try fixture.session.expenseContext()
        let input = await fixture.server.decision
        try await fixture.session.stageManualCycleDecision(input, context: context)
        await fixture.server.change("linked", consumeAtFence: true)
        let view = await fixture.presentation()
        await view.load()
        await view.retry()
        XCTAssertEqual(view.saved?.decision, input)
        XCTAssertEqual(view.saved?.result?.approval.status, .consumed)
        XCTAssertNotNil(view.saved?.result?.approval.receipt)
        XCTAssertNil(view.saved?.conflict)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
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
            XCTAssertNil(view.proposalContext)
            if switchMember {
                let pending = try await fixture.session.savedManualCycleDecision(fixture.session.expenseContext())
                XCTAssertNil(pending)
            }
        }
    }
}
