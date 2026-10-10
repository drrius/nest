import Foundation
import XCTest

@testable import Nest

@MainActor
final class VariableCycleApprovalModelTests: XCTestCase {
    private func fixture(
        loseReply: Bool = false
    ) async throws -> VariableCycleApprovalTestFixture {
        let fixture = try await VariableCycleApprovalTestFixture.make(loseReply: loseReply)
        let url = fixture.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return fixture
    }

    func testBillRequiresExplicitChoiceAndRecordsOnlyTheReviewedCycle() async throws {
        for approved in [true, false] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            XCTAssertEqual(view.proposal?.status, .pending)
            XCTAssertEqual(view.proposal?.input.amountCentimes.value, 101)
            let before = await fixture.server.writes
            XCTAssertEqual(before, 0)
            await view.decide(approved)
            XCTAssertEqual(view.saved?.decision.approved, approved)
            XCTAssertEqual(view.saved?.result?.approval.status, approved ? .consumed : .denied)
            let receipt = view.saved?.result?.approval.receipt
            XCTAssertEqual(receipt?.expense.amountCentimes.value, approved ? 101 : nil)
            XCTAssertEqual(receipt?.configuration.mode, approved ? .variable : nil)
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
            let reopened = VariableCycleApprovalModel(
                session: session, member: fixture.member, approvalId: saved.decision.approvalId)
            await reopened.load()
            XCTAssertEqual(reopened.saved?.decision, saved.decision)
            XCTAssertEqual(reopened.saved?.reviewedDetail.rule, saved.reviewedDetail.rule)
            await reopened.retry()
            XCTAssertEqual(reopened.saved?.result?.approval.status, approved ? .consumed : .denied)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 1)
        }
    }

    func testOfflineAndChangedRulePreflightCannotJournalOrConfirmANewDecision() async throws {
        for fault in ["offline", "expired", "revision", "coverage", "member"] {
            let fixture = try await fixture()
            let view = await fixture.presentation()
            await view.load()
            switch fault {
            case "offline": await fixture.server.goOffline()
            case "expired": await fixture.server.expire()
            case "revision": await fixture.server.changeRule()
            case "coverage": try await fixture.server.coverCycle()
            default: await fixture.server.replacePartner()
            }
            await view.decide(true)
            XCTAssertNil(view.saved)
            let stored = try await fixture.session.savedVariableCycleDecision(fixture.session.expenseContext())
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
            try await fixture.session.stageVariableCycleDecision(input, context: context)
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
        for covered in [false, true] {
            let fixture = try await fixture()
            let context = try fixture.session.expenseContext()
            let input = await fixture.server.decision
            try await fixture.session.stageVariableCycleDecision(input, context: context)
            if covered {
                try await fixture.server.coverCycle(failFencedRead: true)
            } else {
                await fixture.server.changeRule(failFencedRead: true)
            }
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
        try await fixture.session.stageVariableCycleDecision(input, context: context)
        try await fixture.server.coverCycle(consumeDuringFence: true)
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
            XCTAssertNil(view.detail)
            if switchMember {
                let pending = try await fixture.session.savedVariableCycleDecision(fixture.session.expenseContext())
                XCTAssertNil(pending)
            }
        }
    }
}
