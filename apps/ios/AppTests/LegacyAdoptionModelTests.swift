import Foundation
import XCTest

@testable import Nest

@MainActor
final class LegacyAdoptionModelTests: XCTestCase {
    private func fixture() async throws -> LegacyAdoptionTestFixture {
        let value = try await LegacyAdoptionTestFixture.make()
        let url = value.base.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return value
    }

    func testBothMembersAdoptOnlyExplicitNewTermsBeyondCoveredHistory() async throws {
        for partner in [false, true] {
            let fixture = try await fixture()
            let member = partner ? fixture.base.partner : fixture.base.member
            if partner { await fixture.session.signIn(idToken: "B", nonce: "fixture") }
            let model = try await fixture.reviewedModel(member: member)
            let review = try XCTUnwrap(model.review)
            XCTAssertEqual(review.current.rule.description, "Original fictional rule")
            XCTAssertEqual(review.current.rule.amountCentimes.value, 101)
            let before = await fixture.server.writes
            XCTAssertEqual(before, 0)
            await model.confirm(review)
            XCTAssertEqual(model.saved?.result?.status, .recorded)
            XCTAssertEqual(model.saved?.result?.receipt?.actorId, member.userId)
            XCTAssertEqual(model.saved?.result?.receipt?.reviewed, review.current)
            XCTAssertTrue(model.saved?.result?.receipt?.reviewed.rule.active == true)
            XCTAssertEqual(model.saved?.result?.receipt?.input.configuration.amountCentimes?.value, 201)
            XCTAssertEqual(model.saved?.result?.receipt?.input.firstDueOn.value, "2026-11-05")
            XCTAssertEqual(review.current.rule.amountCentimes.value, 101)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 1)
            let finished = await model.finish()
            XCTAssertTrue(finished)
            XCTAssertNil(model.saved)
        }
    }

    func testLostCommittedReplyRecoversOriginalReceiptOnRestartWithoutResendingOrRebasing() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        let reviewed = try XCTUnwrap(model.review)
        await fixture.server.loseNextSave()
        await model.confirm(reviewed)
        let pending = try XCTUnwrap(model.saved)
        XCTAssertNil(pending.result?.receipt)
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        XCTAssertEqual(reopened.saved?.command, pending.command)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        XCTAssertEqual(reopened.saved?.result?.receipt?.reviewed, reviewed.current)
        await reopened.retry(cancel: true)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        let writes = await fixture.server.writes
        let cancellations = await fixture.server.cancellationWrites
        XCTAssertEqual(writes, 1)
        XCTAssertEqual(cancellations, 0)
    }

    func testUnresolvedRestartChecksOnlyAndExplicitRetryUsesTheOriginalOperation() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        await fixture.server.failNextSave()
        await model.confirm(try XCTUnwrap(model.review))
        let saved = try XCTUnwrap(model.saved)
        XCTAssertEqual(saved.result?.status, .unresolved)
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        XCTAssertEqual(reopened.saved?.command, saved.command)
        let before = await fixture.server.writes
        XCTAssertEqual(before, 0)
        let cannotFinish = await reopened.finish()
        XCTAssertFalse(cannotFinish)
        await reopened.retry()
        XCTAssertEqual(reopened.saved?.result?.receipt?.operationId, saved.command.operationId)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        let after = await fixture.server.writes
        XCTAssertEqual(after, 1)
    }

    func testChangedRawTokenPreservesIntentAndLostCancellationRecoversWithoutConfirmation() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        await fixture.server.failNextSave()
        await model.confirm(try XCTUnwrap(model.review))
        let saved = try XCTUnwrap(model.saved)
        await fixture.server.setFault("token")
        await model.retry()
        XCTAssertEqual(model.saved?.command, saved.command)
        XCTAssertEqual(model.saved?.reviewed, saved.reviewed)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await fixture.server.loseNextCancellation()
        await model.retry(cancel: true)
        XCTAssertTrue(model.saved?.cancellationRequested == true)
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        XCTAssertEqual(reopened.saved?.result?.status, .cancelled)
        await reopened.retry()
        XCTAssertEqual(reopened.saved?.result?.status, .cancelled)
        let writes = await fixture.server.writes
        let cancellations = await fixture.server.cancellationWrites
        XCTAssertEqual(writes, 0)
        XCTAssertEqual(cancellations, 1)
        let finished = await reopened.finish()
        XCTAssertTrue(finished)
    }

    func testFreshReviewRefusesOfflineChangedTokenTermsSourceStatusAndHouseholdBeforeJournaling() async throws {
        for fault in ["offline", "token", "terms", "coverage", "day", "pending", "identity", "scope", "members"] {
            let fixture = try await fixture()
            let model = try await fixture.reviewedModel()
            let review = try XCTUnwrap(model.review)
            await fixture.server.setFault(fault)
            await model.confirm(review)
            XCTAssertNil(model.saved, fault)
            XCTAssertNotNil(model.notice, fault)
            let pending = try await fixture.session.savedLegacyAdoption(fixture.session.expenseContext())
            XCTAssertNil(pending, fault)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0, fault)
        }
    }

    func testReloadAndBackgroundInvalidateOldCallbacksEvenWhenRawTermsHaveNotChanged() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        let old = try XCTUnwrap(model.review)
        await model.load()
        try model.prepare(fixture.newTerms())
        let refreshed = try XCTUnwrap(model.review)
        XCTAssertEqual(old.current, refreshed.current)
        XCTAssertNotEqual(old.identity, refreshed.identity)
        await model.confirm(old)
        XCTAssertNil(model.saved)
        model.suspendReview()
        await model.confirm(refreshed)
        XCTAssertNil(model.saved)
        await fixture.server.pauseNextRead()
        let load = Task { await model.load() }
        await fixture.server.waitForRead()
        model.suspendReview()
        await fixture.server.releaseRead()
        await load.value
        XCTAssertNil(model.review)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testDelayedReadsAndPreflightCannotCrossSignOutOrMemberReplacement() async throws {
        for replace in [false, true] {
            for confirming in [false, true] {
                let fixture = try await fixture()
                let model = try await fixture.reviewedModel()
                let review = try XCTUnwrap(model.review)
                await fixture.server.pauseNextRead()
                let pending = Task {
                    if confirming { await model.confirm(review) } else { await model.load() }
                }
                await fixture.server.waitForRead()
                if replace {
                    await fixture.session.signIn(idToken: "B", nonce: "fixture")
                } else {
                    await fixture.session.signOut()
                }
                await fixture.server.releaseRead()
                await pending.value
                XCTAssertNil(model.review)
                XCTAssertNil(model.saved)
                XCTAssertNil(model.notice)
                let writes = await fixture.server.writes
                XCTAssertEqual(writes, 0)
                if replace {
                    let hidden = try await fixture.session.savedLegacyAdoption(fixture.session.expenseContext())
                    XCTAssertNil(hidden)
                }
            }
        }
    }

    func testSQLiteStagingFailureSendsNothingAndCleanupFailureKeepsTheRecordedReceipt() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        let reviewed = try XCTUnwrap(model.review)
        let db = try SQLiteConnection(url: fixture.base.url)
        try db.run(
            "CREATE TRIGGER fail_legacy_insert BEFORE INSERT ON legacy_adoption_commands BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        await model.confirm(reviewed)
        XCTAssertNil(model.saved)
        let before = await fixture.server.writes
        XCTAssertEqual(before, 0)
        try db.run("DROP TRIGGER fail_legacy_insert")
        await model.confirm(reviewed)
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        try db.run(
            "CREATE TRIGGER fail_legacy_delete BEFORE DELETE ON legacy_adoption_commands BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        let cannotFinish = await model.finish()
        XCTAssertFalse(cannotFinish)
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        try db.run("DROP TRIGGER fail_legacy_delete")
        let finished = await model.finish()
        XCTAssertTrue(finished)
    }

    func testEditingInvalidatesOldTermsAndCancellationMustPersistBeforeDispatch() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        let first = try XCTUnwrap(model.review)
        model.edit()
        await model.confirm(first)
        XCTAssertNil(model.saved)
        try model.prepare(fixture.newTerms())
        let second = try XCTUnwrap(model.review)
        XCTAssertNotEqual(first.identity, second.identity)
        await fixture.server.failNextSave()
        await model.confirm(second)
        let pending = try XCTUnwrap(model.saved)
        let db = try SQLiteConnection(url: fixture.base.url)
        try db.run(
            "CREATE TRIGGER fail_legacy_update BEFORE UPDATE ON legacy_adoption_commands BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        await model.retry(cancel: true)
        XCTAssertEqual(model.saved?.command, pending.command)
        XCTAssertFalse(model.saved?.cancellationRequested == true)
        let blocked = await fixture.server.cancellationWrites
        XCTAssertEqual(blocked, 0)
        try db.run("DROP TRIGGER fail_legacy_update")
        await model.retry(cancel: true)
        XCTAssertEqual(model.saved?.result?.status, .cancelled)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testActiveOldRuleNeverDefaultsToAutomaticAndExplicitVariableTermsCarryNoFixedAmount() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        var draft = RecurringDraft(member: fixture.base.member, today: try XCTUnwrap(model.today))
        XCTAssertEqual(draft.mode, .variable)
        XCTAssertEqual(draft.amount, "")
        XCTAssertEqual(draft.shares, [:])
        XCTAssertThrowsError(try model.prepare(draft))
        draft.description = "Explicit variable bill"
        draft.scheduleDay = 31
        try model.prepare(draft)
        let review = try XCTUnwrap(model.review)
        XCTAssertNil(review.input.configuration.amountCentimes)
        XCTAssertNil(review.input.configuration.allocations)
        XCTAssertEqual(review.input.firstDueOn.value, "2026-11-30")
        await model.confirm(review)
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        XCTAssertEqual(model.saved?.result?.receipt?.input.configuration.mode, .variable)
    }

    func testServerDayAdvanceKeepsExactUnknownIntentUntilExplicitCancellation() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        await fixture.server.failNextSave()
        await model.confirm(try XCTUnwrap(model.review))
        let original = try XCTUnwrap(model.saved)
        await fixture.server.setFault("day")
        await model.retry()
        XCTAssertEqual(model.saved?.command, original.command)
        XCTAssertEqual(model.saved?.reviewed, original.reviewed)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
        await model.retry(cancel: true)
        XCTAssertEqual(model.saved?.result?.status, .cancelled)
    }

    func testRevertedRawFingerprintDoesNotRetireOrRebaseConsentAndRequiresAnExplicitRetry() async throws {
        let fixture = try await fixture()
        let model = try await fixture.reviewedModel()
        await fixture.server.failNextSave()
        await model.confirm(try XCTUnwrap(model.review))
        let original = try XCTUnwrap(model.saved)
        await fixture.server.setFault("token")
        await model.retry()
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await fixture.server.setFault("none")
        await model.load()
        XCTAssertEqual(model.saved?.command, original.command)
        let before = await fixture.server.writes
        XCTAssertEqual(before, 0)
        await model.retry()
        XCTAssertEqual(model.saved?.result?.receipt?.operationId, original.command.operationId)
        XCTAssertEqual(model.saved?.result?.receipt?.reviewed, original.reviewed)
    }

}
