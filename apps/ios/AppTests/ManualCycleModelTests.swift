import Foundation
import XCTest

@testable import Nest

@MainActor
final class ManualCycleModelTests: XCTestCase {
    private func fixture(loseReply: Bool = false) async throws -> ManualCycleTestFixture {
        let fixture = try await ManualCycleTestFixture.make(loseReply: loseReply)
        let url = fixture.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return fixture
    }

    func testReviewAndLoadNeverLinkUntilExplicitConfirmation() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        XCTAssertEqual(model.candidates.count, 1)
        await model.select(await fixture.server.sourceId)
        XCTAssertEqual(model.review?.source.event.amountCentimes.value, 101)
        XCTAssertEqual(model.review?.target.rule.configuration.amountCentimes?.value, 990)
        let before = await fixture.server.writes
        XCTAssertEqual(before, 0)
        await model.confirm()
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        XCTAssertEqual(model.saved?.result?.receipt?.linkedExpense.event.amountCentimes.value, 101)
        let after = await fixture.server.writes
        XCTAssertEqual(after, 1)
        await model.finish()
        XCTAssertNil(model.saved)
    }

    func testOlderExpensePagesPreserveExactOrderAndDoNotLinkOnLoad() async throws {
        let fixture = try await fixture()
        await fixture.server.usePaginatedHistory()
        let model = await fixture.presentation()
        await model.load()
        XCTAssertEqual(model.events.count, 50)
        XCTAssertNotNil(model.next)
        await model.load(more: true)
        XCTAssertEqual(model.events.count, 51)
        XCTAssertNil(model.next)
        XCTAssertEqual(Set(model.events.map(\.id)).count, 51)
        XCTAssertEqual(model.candidates.count, 51)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testLostLinkReplySurvivesRestartAndCancellationRecoversTheRecord() async throws {
        for cancel in [false, true] {
            let fixture = try await fixture(loseReply: true)
            let model = await fixture.presentation()
            await model.load()
            await model.select(await fixture.server.sourceId)
            await model.confirm()
            let pending = try XCTUnwrap(model.saved)
            XCTAssertNil(pending.result?.receipt)
            let session = try await fixture.reopenedSession()
            let reopened = await fixture.presentation(session: session)
            await reopened.load()
            XCTAssertEqual(reopened.saved?.command, pending.command)
            let before = await fixture.server.writes
            XCTAssertEqual(before, 1)
            await reopened.retry(cancel: cancel)
            XCTAssertEqual(reopened.saved?.result?.status, .recorded)
            XCTAssertEqual(reopened.saved?.result?.receipt?.operationId, pending.command.operationId)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 1)
        }
    }

    func testFreshPreflightRefusesOfflineChangedCoveredReversedOrForeignContextBeforeJournaling() async throws {
        for fault in ["offline", "revision", "covered", "paused", "future", "member", "reversed"] {
            let fixture = try await fixture()
            let model = await fixture.presentation()
            await model.load()
            await model.select(await fixture.server.sourceId)
            XCTAssertNotNil(model.review)
            await fixture.server.setFault(fault)
            await model.confirm()
            XCTAssertNil(model.saved, fault)
            XCTAssertNotNil(model.review, fault)
            XCTAssertNotNil(model.notice, fault)
            let stored = try await fixture.session.savedManualCycle(fixture.session.expenseContext())
            XCTAssertNil(stored, fault)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0, fault)
        }
    }

    func testLostCancellationSurvivesRestartAndNeverPostsAnExpenseLink() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        await model.select(await fixture.server.sourceId)
        let input = try XCTUnwrap(model.review?.input)
        try await fixture.session.stageManualCycle(input, context: fixture.session.expenseContext())
        await model.load()
        await fixture.server.dropNextCancellation()
        await model.retry(cancel: true)
        XCTAssertTrue(model.saved?.cancellationRequested == true)
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        await reopened.retry()
        XCTAssertEqual(reopened.saved?.result?.status, .cancelled)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
        await reopened.finish()
        XCTAssertNil(reopened.saved)
    }

    func testDelayedConfirmationCannotCrossSignOutOrMemberSwitch() async throws {
        for switchMember in [false, true] {
            let fixture = try await fixture()
            let model = await fixture.presentation()
            await model.load()
            await model.select(await fixture.server.sourceId)
            await fixture.server.pauseNextRead()
            let confirm = Task { await model.confirm() }
            await fixture.server.waitForRead()
            if switchMember {
                await fixture.session.signIn(idToken: "B", nonce: "fixture")
            } else {
                await fixture.session.signOut()
            }
            await fixture.server.releaseRead()
            await confirm.value
            XCTAssertNil(model.review)
            XCTAssertNil(model.saved)
            XCTAssertTrue(model.events.isEmpty)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
            if switchMember {
                let other = try await fixture.session.savedManualCycle(fixture.session.expenseContext())
                XCTAssertNil(other)
            }
        }
    }
}
