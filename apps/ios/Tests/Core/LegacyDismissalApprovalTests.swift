import Foundation
import XCTest

@testable import NestCore

final class LegacyDismissalApprovalTests: XCTestCase {
    private func fixture(_ key: String) throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-legacy-dismissal-approval", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        return try XCTUnwrap(root[key] as? [String: Any])
    }
    private func decode<T: Decodable>(_ raw: [String: Any], as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func proposal() throws -> LegacyDismissalApprovalEnvelope {
        try decode(fixture("envelope"), as: LegacyDismissalApprovalEnvelope.self)
    }
    private func member(_ proposal: LegacyDismissalApprovalEnvelope) -> VerifiedMember {
        .init(userId: proposal.actorId, householdId: proposal.householdId, displayName: "Alex")
    }
    private func decision(_ proposal: LegacyDismissalApprovalEnvelope, approved: Bool = true)
        -> LegacyDismissalDecision
    {
        .init(
            operationId: proposal.approval.operationId, approvalId: proposal.approval.id,
            input: proposal.approval.input, approved: approved)
    }
    private func outcome(_ proposal: LegacyDismissalApprovalEnvelope, consumed: Bool) throws
        -> LegacyDismissalApprovalEnvelope
    {
        let receipt = try decode(fixture("receipt"), as: LegacyDismissalReceipt.self)
        return .init(
            version: 1, actorId: proposal.actorId, householdId: proposal.householdId,
            approval: .init(
                id: proposal.approval.id, operationId: proposal.approval.operationId, input: proposal.approval.input,
                status: consumed ? .consumed : .denied, expiresAt: proposal.approval.expiresAt,
                receipt: consumed ? receipt : nil))
    }

    func testPrivateEnvelopeAndContextBindOwnerApprovalOperationAndOriginalRawInput() throws {
        let proposal = try proposal()
        let owner = member(proposal)
        let context = try decode(fixture("context"), as: LegacyDismissalProposalContext.self)
        _ = try proposal.validated(member: owner, approvalId: proposal.approval.id)
        _ = try context.validated(member: owner, approvalId: proposal.approval.id, input: proposal.approval.input)
        XCTAssertTrue(context.matches)
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(proposal)) as? NSDictionary)
        XCTAssertEqual(encoded, try fixture("envelope") as NSDictionary)
        let raw = try fixture("envelope")
        for field in ["actorId", "householdId"] {
            var changed = raw
            changed[field] = UUID().uuidString
            let decoded = try decode(changed, as: LegacyDismissalApprovalEnvelope.self)
            XCTAssertThrowsError(try decoded.matching(decision(proposal), member: owner))
        }
        for field in ["id", "operationId"] {
            var changed = raw
            var approval = try XCTUnwrap(changed["approval"] as? [String: Any])
            approval[field] = UUID().uuidString
            changed["approval"] = approval
            let decoded = try decode(changed, as: LegacyDismissalApprovalEnvelope.self)
            XCTAssertThrowsError(try decoded.matching(decision(proposal), member: owner))
        }
    }

    func testChangedFingerprintRemainsCurrentContextWithoutRebasingTheOldProposal() throws {
        let proposal = try proposal()
        let original = try fixture("context")
        for token in [String(repeating: "a", count: 64), String(repeating: "b", count: 64)] {
            var raw = original
            var review = try XCTUnwrap(raw["review"] as? [String: Any])
            review["reviewToken"] = token
            raw["review"] = review
            let context = try decode(raw, as: LegacyDismissalProposalContext.self)
            _ = try context.validated(
                member: member(proposal), approvalId: proposal.approval.id, input: proposal.approval.input)
            XCTAssertFalse(context.matches)
            XCTAssertEqual(context.input.reviewToken, proposal.approval.input.reviewToken)
        }
        var raw = original
        raw["approvalId"] = UUID().uuidString
        let foreign = try decode(raw, as: LegacyDismissalProposalContext.self)
        XCTAssertThrowsError(
            try foreign.validated(
                member: member(proposal), approvalId: proposal.approval.id, input: proposal.approval.input))
    }

    func testActualRecordedOutcomeWinsWithdrawalButNonterminalResponsesCannotClaimCompletion() throws {
        let proposal = try proposal()
        let withdrawn = decision(proposal, approved: false)
        _ = try outcome(proposal, consumed: true).matching(withdrawn, member: member(proposal), terminal: true)
        _ = try outcome(proposal, consumed: false).matching(withdrawn, member: member(proposal), terminal: true)
        XCTAssertThrowsError(try proposal.matching(withdrawn, member: member(proposal), terminal: true))
        var raw = try fixture("receipt")
        raw["approvalId"] = UUID().uuidString
        let foreign = try decode(raw, as: LegacyDismissalReceipt.self)
        XCTAssertThrowsError(
            try foreign.validated(
                member: member(proposal),
                command: .init(operationId: proposal.approval.operationId, input: proposal.approval.input),
                approvalId: proposal.approval.id))
    }

    func testWithdrawalPersistsOriginalConsentAcrossRestartAndCannotClearUnresolvedIntent() async throws {
        let proposal = try proposal()
        let context = try decode(fixture("context"), as: LegacyDismissalProposalContext.self)
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member(proposal))
        try await first.enqueueLegacyDismissalDecision(decision(proposal), context: context, lease: lease)
        try await first.withdrawLegacyDismissalDecision(lease: lease)
        do {
            try await first.finishLegacyDismissalDecision(approvalId: proposal.approval.id, lease: lease)
            XCTFail("Discarded unknown outcome")
        } catch OfflineFailure.invalidOperation {}
        let reopened = try ChoreOfflineStore(url: url)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: proposal.householdId, displayName: "Other"))
        let hidden = try await reopened.readLegacyDismissalDecision(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member(proposal))
        let saved = try await reopened.readLegacyDismissalDecision(lease: restored)
        XCTAssertEqual(saved?.decision, decision(proposal))
        XCTAssertTrue(saved?.withdrawalRequested == true)
        XCTAssertEqual(saved?.sending, decision(proposal, approved: false))
        XCTAssertFalse(saved?.isTerminal == true)
        let recorded = try outcome(proposal, consumed: true)
        try await reopened.reconcileLegacyDismissalDecision(recorded, lease: restored)
        do {
            try await reopened.reconcileLegacyDismissalDecision(outcome(proposal, consumed: false), lease: restored)
            XCTFail("Withdrawal erased actual recorded outcome")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishLegacyDismissalDecision(approvalId: proposal.approval.id, lease: restored)
        let cleared = try await reopened.readLegacyDismissalDecision(lease: restored)
        XCTAssertNil(cleared)
    }

    func testAssistantProposalLinksRequireExactKnownDraftAndPrivateOwnerWithoutAcceptingModelTokens() throws {
        let proposal = try proposal()
        let raw = try fixture("assistant")
        let data = try JSONSerialization.data(withJSONObject: raw)
        let json = try JSONDecoder().decode(AssistantJSON.self, from: data)
        guard case .object(var part) = json else { return XCTFail("Fixture shape") }
        let owner = member(proposal)
        let link = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: owner))
        XCTAssertEqual(link.command, .dismissLegacy)
        XCTAssertEqual(link.id, proposal.approval.id)
        let outsider = VerifiedMember(userId: UUID(), householdId: proposal.householdId, displayName: "Other")
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: outsider))
        part["input"] = .object([
            "draftId": .string(proposal.approval.input.draftId.uuidString),
            "reviewToken": .string(proposal.approval.input.reviewToken.value),
        ])
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
        part["input"] = .object(["draftId": .string(UUID().uuidString)])
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
        part["input"] = .object(["draftId": .string(proposal.approval.input.draftId.uuidString)])
        part["state"] = .string("input-available")
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
    }

    func testAbsentDraftContextCannotAuthorizeConsentButAllowsAReviewedPrivateDecline() async throws {
        let proposal = try proposal()
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-decline-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member(proposal))
        do {
            try await store.enqueueLegacyDismissalDecision(decision(proposal), context: nil, lease: lease)
            XCTFail("Missing retained terms authorized dismissal")
        } catch OfflineFailure.invalidOperation {}
        let decline = decision(proposal, approved: false)
        try await store.enqueueLegacyDismissalDecision(decline, context: nil, lease: lease)
        let saved = try await store.readLegacyDismissalDecision(lease: lease)
        XCTAssertEqual(saved?.decision, decline)
        XCTAssertNil(saved?.reviewedContext)
        XCTAssertFalse(saved?.isTerminal == true)
        try await store.reconcileLegacyDismissalDecision(outcome(proposal, consumed: false), lease: lease)
        try await store.finishLegacyDismissalDecision(approvalId: proposal.approval.id, lease: lease)
    }
}
