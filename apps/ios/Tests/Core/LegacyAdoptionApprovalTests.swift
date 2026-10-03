import Foundation
import XCTest

@testable import NestCore

final class LegacyAdoptionApprovalTests: XCTestCase {
    private func fixture(_ key: String) throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-legacy-adoption-approval", withExtension: "json", subdirectory: "Fixtures"))
        let root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        return try XCTUnwrap(root[key] as? [String: Any])
    }
    private func decode<T: Decodable>(_ raw: [String: Any], as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func proposal() throws -> LegacyAdoptionApprovalEnvelope {
        try decode(fixture("envelope"), as: LegacyAdoptionApprovalEnvelope.self)
    }
    private func member(_ proposal: LegacyAdoptionApprovalEnvelope) -> VerifiedMember {
        .init(userId: proposal.actorId, householdId: proposal.householdId, displayName: "Alex")
    }
    private func decision(_ proposal: LegacyAdoptionApprovalEnvelope, approved: Bool = true)
        -> LegacyAdoptionDecision
    {
        .init(
            operationId: proposal.approval.operationId, approvalId: proposal.approval.id,
            input: proposal.approval.input, approved: approved)
    }
    private func outcome(_ proposal: LegacyAdoptionApprovalEnvelope, consumed: Bool) throws
        -> LegacyAdoptionApprovalEnvelope
    {
        let receipt = try decode(fixture("receipt"), as: LegacyAdoptionReceipt.self)
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
        let context = try decode(fixture("context"), as: LegacyAdoptionProposalContext.self)
        _ = try proposal.validated(member: owner, approvalId: proposal.approval.id)
        _ = try context.validated(member: owner, approvalId: proposal.approval.id, input: proposal.approval.input)
        XCTAssertTrue(context.matches)
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(proposal)) as? NSDictionary)
        XCTAssertEqual(encoded, try fixture("envelope") as NSDictionary)
        let raw = try fixture("envelope")
        for field in ["actorId", "householdId"] {
            var changed = raw
            changed[field] = UUID().uuidString
            let decoded = try decode(changed, as: LegacyAdoptionApprovalEnvelope.self)
            XCTAssertThrowsError(try decoded.matching(decision(proposal), member: owner))
        }
        for field in ["id", "operationId"] {
            var changed = raw
            var approval = try XCTUnwrap(changed["approval"] as? [String: Any])
            approval[field] = UUID().uuidString
            changed["approval"] = approval
            let decoded = try decode(changed, as: LegacyAdoptionApprovalEnvelope.self)
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
            let context = try decode(raw, as: LegacyAdoptionProposalContext.self)
            _ = try context.validated(
                member: member(proposal), approvalId: proposal.approval.id, input: proposal.approval.input)
            XCTAssertFalse(context.matches)
            XCTAssertEqual(context.input.reviewToken, proposal.approval.input.reviewToken)
        }
        var raw = original
        raw["approvalId"] = UUID().uuidString
        let foreign = try decode(raw, as: LegacyAdoptionProposalContext.self)
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
        let foreign = try decode(raw, as: LegacyAdoptionReceipt.self)
        XCTAssertThrowsError(
            try foreign.validated(
                member: member(proposal),
                command: .init(operationId: proposal.approval.operationId, input: proposal.approval.input),
                approvalId: proposal.approval.id))
    }

    func testWithdrawalPersistsOriginalConsentAcrossRestartAndCannotClearUnresolvedIntent() async throws {
        let proposal = try proposal()
        let context = try decode(fixture("context"), as: LegacyAdoptionProposalContext.self)
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-decision-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member(proposal))
        try await first.enqueueLegacyAdoptionDecision(decision(proposal), context: context, lease: lease)
        try await first.withdrawLegacyAdoptionDecision(lease: lease)
        do {
            try await first.finishLegacyAdoptionDecision(approvalId: proposal.approval.id, lease: lease)
            XCTFail("Discarded unknown outcome")
        } catch OfflineFailure.invalidOperation {}
        let reopened = try ChoreOfflineStore(url: url)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: proposal.householdId, displayName: "Other"))
        let hidden = try await reopened.readLegacyAdoptionDecision(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member(proposal))
        let saved = try await reopened.readLegacyAdoptionDecision(lease: restored)
        XCTAssertEqual(saved?.decision, decision(proposal))
        XCTAssertTrue(saved?.withdrawalRequested == true)
        XCTAssertEqual(saved?.sending, decision(proposal, approved: false))
        XCTAssertFalse(saved?.isTerminal == true)
        let recorded = try outcome(proposal, consumed: true)
        try await reopened.reconcileLegacyAdoptionDecision(recorded, lease: restored)
        do {
            try await reopened.reconcileLegacyAdoptionDecision(outcome(proposal, consumed: false), lease: restored)
            XCTFail("Withdrawal erased actual recorded outcome")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishLegacyAdoptionDecision(approvalId: proposal.approval.id, lease: restored)
        let cleared = try await reopened.readLegacyAdoptionDecision(lease: restored)
        XCTAssertNil(cleared)
    }

    func testAssistantProposalLinksRequireExactKnownRuleAndPrivateOwnerWithoutAcceptingModelTokens() throws {
        let proposal = try proposal()
        let raw = try fixture("assistant")
        let data = try JSONSerialization.data(withJSONObject: raw)
        let json = try JSONDecoder().decode(AssistantJSON.self, from: data)
        guard case .object(var part) = json else { return XCTFail("Fixture shape") }
        let owner = member(proposal)
        let link = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: owner))
        XCTAssertEqual(link.command, .adoptLegacy)
        XCTAssertEqual(link.id, proposal.approval.id)
        let outsider = VerifiedMember(userId: UUID(), householdId: proposal.householdId, displayName: "Other")
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: outsider))
        part["input"] = .object([
            "ruleId": .string(proposal.approval.input.ruleId.uuidString),
            "reviewToken": .string(proposal.approval.input.reviewToken.value),
        ])
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
        part["input"] = .object(["ruleId": .string(UUID().uuidString)])
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
        part["input"] = .object([
            "ruleId": .string(proposal.approval.input.ruleId.uuidString),
            "configuration": try JSONDecoder().decode(
                AssistantJSON.self, from: JSONEncoder().encode(proposal.approval.input.configuration)),
        ])
        part["state"] = .string("input-available")
        XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner))
    }

    func testAbsentRuleContextCannotAuthorizeConsentButAllowsAReviewedPrivateDecline() async throws {
        let proposal = try proposal()
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-decline-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member(proposal))
        do {
            try await store.enqueueLegacyAdoptionDecision(decision(proposal), context: nil, lease: lease)
            XCTFail("Missing retained terms authorized dismissal")
        } catch OfflineFailure.invalidOperation {}
        let decline = decision(proposal, approved: false)
        try await store.enqueueLegacyAdoptionDecision(decline, context: nil, lease: lease)
        let saved = try await store.readLegacyAdoptionDecision(lease: lease)
        XCTAssertEqual(saved?.decision, decline)
        XCTAssertNil(saved?.reviewedContext)
        XCTAssertFalse(saved?.isTerminal == true)
        try await store.reconcileLegacyAdoptionDecision(outcome(proposal, consumed: false), lease: lease)
        try await store.finishLegacyAdoptionDecision(approvalId: proposal.approval.id, lease: lease)
    }
    func testAssistantLinksBindTheCompleteNewMandateAndRejectInventedReceiptFields() throws {
        let proposal = try proposal()
        let original = try fixture("assistant")
        let owner = member(proposal)
        for field in [
            "description", "amountCentimes", "payerId", "startDate", "note", "categoryId", "receiptPath",
            "receiptTotalCentimes", "unexpected",
        ] {
            var raw = original
            var input = try XCTUnwrap(raw["input"] as? [String: Any])
            var expense = try XCTUnwrap(input["configuration"] as? [String: Any])
            switch field {
            case "amountCentimes", "receiptTotalCentimes": expense[field] = "102"
            case "payerId", "categoryId": expense[field] = UUID().uuidString
            case "startDate": expense[field] = "2026-10-04"
            default: expense[field] = "Unapproved changed value"
            }
            input["configuration"] = expense
            raw["input"] = input
            let json = try JSONDecoder().decode(AssistantJSON.self, from: JSONSerialization.data(withJSONObject: raw))
            guard case .object(let part) = json else { return XCTFail("Fixture shape") }
            XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner), field)
        }
        let recorded = try outcome(proposal, consumed: true)
        let receipt = try XCTUnwrap(recorded.approval.receipt)
        XCTAssertNotEqual(receipt.input.configuration.amountCentimes, receipt.reviewed.rule.amountCentimes)
        XCTAssertEqual(receipt.input.configuration, proposal.approval.input.configuration)
    }

    func testAssistantCannotSubstituteValidAmountsSplitsSchedulesOrRecordingModes() throws {
        let proposal = try proposal()
        let owner = member(proposal)
        let original = try fixture("assistant")
        for change in ["amountAndSplit", "splitOnly", "schedule", "scheduleExtra", "variable", "firstDue", "token"] {
            var raw = original
            var input = try XCTUnwrap(raw["input"] as? [String: Any])
            var config = try XCTUnwrap(input["configuration"] as? [String: Any])
            var shares = try XCTUnwrap(config["allocations"] as? [[String: Any]])
            switch change {
            case "amountAndSplit":
                config["amountCentimes"] = "102"
                shares[1]["centimes"] = "51"
                config["allocations"] = shares
            case "splitOnly":
                shares[0]["centimes"] = "50"
                shares[1]["centimes"] = "51"
                config["allocations"] = shares
            case "schedule": config["schedule"] = ["kind": "weekly", "weekday": 5]
            case "scheduleExtra": config["schedule"] = ["kind": "monthly", "dayOfMonth": 5, "unexpected": 1]
            case "variable":
                config["mode"] = "variable"
                config["amountCentimes"] = NSNull()
                config["allocations"] = NSNull()
            case "firstDue": input["firstDueOn"] = "2026-10-05"
            default: input["reviewToken"] = proposal.approval.input.reviewToken.value
            }
            input["configuration"] = config
            raw["input"] = input
            let json = try JSONDecoder().decode(AssistantJSON.self, from: JSONSerialization.data(withJSONObject: raw))
            guard case .object(let part) = json else { return XCTFail("Fixture shape") }
            XCTAssertNil(PendingFinancialApproval.assistantLink(part, member: owner), change)
        }
    }

}
