import Foundation
import XCTest

@testable import Nest

@MainActor
final class LegacyConfirmationApprovalModelTests: XCTestCase {
    private func fixture() async throws -> LegacyConfirmationApprovalTestFixture {
        let value = try await LegacyConfirmationApprovalTestFixture.make()
        let url = value.base.base.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return value
    }

    func testOwnerReviewsExactPrivateTermsAndExplicitDecisionsHaveOneTerminalOutcome() async throws {
        for approved in [false, true] {
            let fixture = try await fixture()
            let model = await fixture.presentation()
            await model.load()
            let review = try XCTUnwrap(model.review)
            XCTAssertTrue(review.canConfirm)
            let before = await fixture.server.sends
            XCTAssertEqual(before, 0)
            await model.decide(approved, expected: review)
            XCTAssertEqual(model.saved?.result?.approval.status, approved ? .consumed : .denied)
            if approved {
                XCTAssertEqual(model.saved?.result?.approval.receipt?.reviewed, review.context?.review)
                XCTAssertEqual(model.saved?.result?.approval.receipt?.input.expense, try fixture.base.expense())
                XCTAssertNotEqual(
                    model.saved?.result?.approval.receipt?.input.expense.amountCentimes,
                    review.context?.review.draft.amountCentimes)
            }
            let writes = await fixture.server.postings
            XCTAssertEqual(writes, approved ? 1 : 0)
            let finished = await model.finish()
            XCTAssertTrue(finished)
        }
    }

    func testLostCommittedReplyRecoversBeforeChangedDraftReadsWithoutAnyReplay() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        let review = try XCTUnwrap(model.review)
        await fixture.server.loseNextReply()
        await model.decide(true, expected: review)
        let pending = try XCTUnwrap(model.saved)
        XCTAssertFalse(pending.isTerminal)
        await fixture.base.server.setFault("posted")
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        XCTAssertEqual(reopened.saved?.decision, pending.decision)
        XCTAssertEqual(reopened.saved?.result?.approval.status, .consumed)
        XCTAssertEqual(reopened.saved?.result?.approval.receipt?.reviewed, review.context?.review)
        await reopened.retry(withdraw: true)
        XCTAssertEqual(reopened.saved?.result?.approval.status, .consumed)
        let sends = await fixture.server.sends
        let writes = await fixture.server.postings
        XCTAssertEqual(sends, 1)
        XCTAssertEqual(writes, 1)
    }

    func testChangedAndRevertedRawTermsNeverRetireIntentAndWithdrawalSurvivesLostReply() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        await fixture.server.failNextReply()
        await model.decide(true, expected: try XCTUnwrap(model.review))
        let original = try XCTUnwrap(model.saved)
        await fixture.base.server.setFault("token")
        await model.load()
        await model.retry()
        XCTAssertEqual(model.saved?.decision, original.decision)
        XCTAssertFalse(model.saved?.isTerminal == true)
        let unfinished = await model.finish()
        XCTAssertFalse(unfinished)
        await fixture.base.server.setFault("none")
        await model.load()
        let before = await fixture.server.sends
        XCTAssertEqual(before, 1)
        await fixture.server.expire()
        await fixture.server.loseNextReply()
        await model.retry(withdraw: true)
        XCTAssertTrue(model.saved?.withdrawalRequested == true)
        XCTAssertTrue(model.saved?.decision.approved == true)
        let session = try await fixture.reopenedSession()
        let reopened = await fixture.presentation(session: session)
        await reopened.load()
        XCTAssertEqual(reopened.saved?.result?.approval.status, .denied)
        let last = await fixture.server.lastDecision
        XCTAssertFalse(last?.approved == true)
        let writes = await fixture.server.postings
        XCTAssertEqual(writes, 0)
    }

    func testExpiredOrMismatchedProposalCanBeDeclinedWithoutApprovingItsChangedTerms() async throws {
        for fault in ["expired", "token", "shopping", "posted", "linked", "members"] {
            let fixture = try await fixture()
            if fault == "expired" {
                await fixture.server.expire()
            } else {
                await fixture.base.server.setFault(fault)
            }
            let model = await fixture.presentation()
            await model.load()
            let review = try XCTUnwrap(model.review)
            await model.decide(true, expected: review)
            XCTAssertNil(model.saved, fault)
            await model.decide(false, expected: review)
            XCTAssertEqual(model.saved?.result?.approval.status, .denied, fault)
            let writes = await fixture.server.postings
            XCTAssertEqual(writes, 0, fault)
        }
    }

    func testFreshPreflightRejectsChangedOfflineOrForeignReviewBeforeJournaling() async throws {
        for fault in ["offline", "token", "terms", "scope", "shopping", "posted", "linked", "expired", "members"] {
            let fixture = try await fixture()
            let model = await fixture.presentation()
            await model.load()
            let review = try XCTUnwrap(model.review)
            if fault == "expired" {
                await fixture.server.expire()
            } else if fault == "offline" {
                await fixture.server.setOffline(true)
            } else {
                await fixture.base.server.setFault(fault)
            }
            await model.decide(true, expected: review)
            XCTAssertNil(model.saved, fault)
            let pending = try await fixture.session.savedLegacyConfirmationDecision(fixture.session.expenseContext())
            XCTAssertNil(pending, fault)
            let sends = await fixture.server.sends
            XCTAssertEqual(sends, 0, fault)
        }
    }

    func testReloadBackgroundAndDelayedAccountChangesFenceConsentAndPrivateRecovery() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        let old = try XCTUnwrap(model.review)
        await model.load()
        XCTAssertNotEqual(model.review?.identity, old.identity)
        await model.decide(true, expected: old)
        XCTAssertNil(model.saved)
        let current = try XCTUnwrap(model.review)
        model.suspendReview()
        await model.decide(true, expected: current)
        XCTAssertNil(model.saved)
        await fixture.base.server.pauseNextRead()
        let load = Task { await model.load() }
        await fixture.base.server.waitForRead()
        model.suspendReview()
        await fixture.base.server.releaseRead()
        await load.value
        XCTAssertNil(model.review)
        for replace in [false, true] {
            let fixture = try await self.fixture()
            let model = await fixture.presentation()
            await model.load()
            let review = try XCTUnwrap(model.review)
            await fixture.base.server.pauseNextRead()
            let confirm = Task { await model.decide(true, expected: review) }
            await fixture.base.server.waitForRead()
            if replace {
                await fixture.session.signIn(idToken: "B", nonce: "fixture")
            } else {
                await fixture.session.signOut()
            }
            await fixture.base.server.releaseRead()
            await confirm.value
            XCTAssertNil(model.review)
            XCTAssertNil(model.saved)
            XCTAssertNil(model.notice)
            let sends = await fixture.server.sends
            XCTAssertEqual(sends, 0)
        }
    }

    func testPartnerCannotReadPrivateProposalOrSeeOwnersSavedDecision() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        await fixture.server.failNextReply()
        await model.decide(true, expected: try XCTUnwrap(model.review))
        XCTAssertNotNil(model.saved)
        await fixture.session.signIn(idToken: "B", nonce: "fixture")
        let partner = LegacyConfirmationApprovalModel(
            session: fixture.session, member: fixture.base.base.partner, approvalId: await fixture.server.approvalId)
        await partner.load()
        XCTAssertNil(partner.review)
        XCTAssertNil(partner.saved)
        XCTAssertNotNil(partner.notice)
        let hidden = try await fixture.session.savedLegacyConfirmationDecision(fixture.session.expenseContext())
        XCTAssertNil(hidden)
    }

    func testWithdrawalAlreadyPersistedCannotReplayConsentButRecordedExpenseStillWins() async throws {
        for commit in [false, true] {
            let fixture = try await fixture()
            let model = await fixture.presentation()
            await model.load()
            await fixture.server.failNextReply()
            await model.decide(true, expected: try XCTUnwrap(model.review))
            await fixture.server.setOffline(true)
            await model.retry(withdraw: true)
            XCTAssertTrue(model.saved?.withdrawalRequested == true)
            await fixture.server.setOffline(false)
            if commit { await fixture.server.commitApproved() }
            let session = try await fixture.reopenedSession()
            let reopened = await fixture.presentation(session: session)
            await reopened.load()
            await reopened.retry()
            XCTAssertEqual(reopened.saved?.result?.approval.status, commit ? .consumed : .denied)
            let writes = await fixture.server.postings
            XCTAssertEqual(writes, commit ? 1 : 0)
            if !commit {
                let last = await fixture.server.lastDecision
                XCTAssertFalse(last?.approved == true)
            }
        }
    }

    func testSQLiteFailuresFenceInitialConsentWithdrawalAndTerminalCleanup() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        let review = try XCTUnwrap(model.review)
        let db = try SQLiteConnection(url: fixture.base.base.url)
        try db.run(
            "CREATE TRIGGER fail_decision_insert BEFORE INSERT ON legacy_confirmation_decisions BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        await model.decide(true, expected: review)
        XCTAssertNil(model.saved)
        let before = await fixture.server.sends
        XCTAssertEqual(before, 0)
        try db.run("DROP TRIGGER fail_decision_insert")
        await fixture.server.failNextReply()
        await model.decide(true, expected: review)
        XCTAssertNotNil(model.saved)
        try db.run(
            "CREATE TRIGGER fail_decision_update BEFORE UPDATE ON legacy_confirmation_decisions BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        await model.retry(withdraw: true)
        XCTAssertFalse(model.saved?.withdrawalRequested == true)
        let sends = await fixture.server.sends
        XCTAssertEqual(sends, 1)
        try db.run("DROP TRIGGER fail_decision_update")
        await model.retry(withdraw: true)
        XCTAssertEqual(model.saved?.result?.approval.status, .denied)
        try db.run(
            "CREATE TRIGGER fail_decision_delete BEFORE DELETE ON legacy_confirmation_decisions BEGIN SELECT RAISE(ABORT,'fixture'); END"
        )
        let retained = await model.finish()
        XCTAssertFalse(retained)
        XCTAssertEqual(model.saved?.result?.approval.status, .denied)
        try db.run("DROP TRIGGER fail_decision_delete")
        let finished = await model.finish()
        XCTAssertTrue(finished)
    }

    func testInaccessibleDraftContextAllowsOnlyDeclineOfTheFreshOwnerBoundProposal() async throws {
        let fixture = try await fixture()
        await fixture.server.hideDraftContext()
        let model = await fixture.presentation()
        await model.load()
        let review = try XCTUnwrap(model.review)
        XCTAssertNil(review.context)
        await model.decide(true, expected: review)
        XCTAssertNil(model.saved)
        await model.decide(false, expected: review)
        XCTAssertEqual(model.saved?.result?.approval.status, .denied)
        let writes = await fixture.server.postings
        XCTAssertEqual(writes, 0)
    }
    func testSavedDecisionRemainsDiscoverableOfflineAndPartnerCannotDiscoverOwnersJournal() async throws {
        let fixture = try await fixture()
        let model = await fixture.presentation()
        await model.load()
        await fixture.server.failNextReply()
        await model.decide(true, expected: try XCTUnwrap(model.review))
        let saved = try XCTUnwrap(model.saved)
        await fixture.server.setOffline(true)
        let recovery = LegacyDecisionRecoveryModel(session: fixture.session, member: fixture.base.base.member)
        await recovery.load()
        XCTAssertEqual(recovery.confirmation?.decision, saved.decision)
        XCTAssertNil(recovery.dismissal)
        XCTAssertNil(recovery.notice)
        await fixture.session.signIn(idToken: "B", nonce: "fixture")
        await recovery.load()
        XCTAssertNil(recovery.confirmation)
        XCTAssertNil(recovery.dismissal)
        XCTAssertNil(recovery.notice)
        let partner = LegacyDecisionRecoveryModel(session: fixture.session, member: fixture.base.base.partner)
        await partner.load()
        XCTAssertNil(partner.confirmation)
        XCTAssertNil(partner.notice)
        let writes = await fixture.server.postings
        XCTAssertEqual(writes, 0)
    }

    func testSavedDismissalHasASeparateOfflineRecoveryEntryWithoutAConfirmationOrServerList() async throws {
        let fixture = try await LegacyDismissalApprovalTestFixture.make()
        let url = fixture.base.base.url
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = await fixture.presentation()
        await model.load()
        await fixture.server.failNextReply()
        await model.decide(true, expected: try XCTUnwrap(model.review))
        let saved = try XCTUnwrap(model.saved)
        await fixture.server.setOffline(true)
        let recovery = LegacyDecisionRecoveryModel(session: fixture.session, member: fixture.base.base.member)
        await recovery.load()
        XCTAssertEqual(recovery.dismissal?.decision, saved.decision)
        XCTAssertNil(recovery.confirmation)
        XCTAssertNil(recovery.notice)
        let writes = await fixture.server.dismissals
        XCTAssertEqual(writes, 0)
    }

}
