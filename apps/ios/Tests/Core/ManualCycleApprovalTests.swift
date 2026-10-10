import Foundation
import XCTest

@testable import NestCore

final class ManualCycleApprovalTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Alex")

    func testCanonicalLinkRejectsSubstitutedExpenseCycleScopeOrModelIssuedNonce() throws {
        let part = try part()
        let row = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: member))
        XCTAssertEqual(row.command, .linkCycle)
        guard case .object(let input) = part["input"], case .object(let output) = part["output"],
            case .object(let value) = output["value"]
        else { return XCTFail("Missing canonical fixture") }
        for key in ["ruleId", "expectedRevision", "dueOn", "sourceEventId", "operationId", "actorId"] {
            var changed = part
            var fields = input
            fields[key] = .string(UUID().uuidString)
            changed["input"] = .object(fields)
            XCTAssertNil(PendingFinancialApproval.assistantLink(changed, member: member), key)
        }
        for key in ["actorId", "householdId"] {
            var changed = part
            var fields = value
            fields[key] = .string(UUID().uuidString)
            changed["output"] = .object(["ok": .bool(true), "value": .object(fields)])
            XCTAssertNil(PendingFinancialApproval.assistantLink(changed, member: member), key)
        }
        var changed = part
        changed.removeValue(forKey: "input")
        XCTAssertNil(PendingFinancialApproval.assistantLink(changed, member: member))
        changed = part
        changed["state"] = .string("input-available")
        XCTAssertNil(PendingFinancialApproval.assistantLink(changed, member: member))
    }

    func testPrivateRecordedLinkBindsItsOwnerApprovalInputAndImmutableExpense() throws {
        let pending = try envelope()
        let receipt = try privateReceipt(pending.approval)
        let decision = ManualCycleDecision(
            operationId: pending.approval.operationId, approvalId: pending.approval.id,
            input: pending.approval.input, approved: true)
        let consumed = ManualCycleApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, input: decision.input,
                status: .consumed, expiresAt: pending.approval.expiresAt, receipt: receipt))
        _ = try consumed.matching(decision, member: member, terminal: true)
        XCTAssertEqual(receipt.linkedExpense.event.amountCentimes.value, 101)
        XCTAssertEqual(receipt.configuration.amountCentimes?.value, 990)
        let root = try object(receipt)
        for key in ["actorId", "householdId", "operationId", "approvalId", "eventId", "source"] {
            var changed = root
            changed[key] = UUID().uuidString
            let decoded: ManualCycleReceipt = try decode(changed)
            XCTAssertThrowsError(
                try decoded.validated(
                    member: member, command: .init(operationId: decision.operationId, input: decision.input),
                    approvalId: decision.approvalId), key)
        }
        for (key, field, value) in [
            ("linkedExpense", "householdId", UUID().uuidString),
            ("linkedExpense", "reversedById", UUID().uuidString),
            ("cycle", "through", "2026-11-01"),
            ("input", "sourceEventId", UUID().uuidString),
        ] {
            var nested = try XCTUnwrap(root[key] as? [String: Any])
            nested[field] = value
            var changed = root
            changed[key] = nested
            let decoded: ManualCycleReceipt = try decode(changed)
            XCTAssertThrowsError(
                try decoded.validated(
                    member: member, command: .init(operationId: decision.operationId, input: decision.input),
                    approvalId: decision.approvalId))
        }
        let denial = ManualCycleDecision(
            operationId: decision.operationId, approvalId: decision.approvalId, input: decision.input, approved: false)
        XCTAssertThrowsError(try consumed.matching(denial, member: member, terminal: true))
        _ = try consumed.matching(denial, member: member, terminal: false)
    }

    func testContextBindsCurrentExpenseRuleAndPermanentConflictWithoutSubstitutingNewTerms() throws {
        let pending = try envelope()
        let context = try context(pending.approval)
        _ = try context.validated(member: member, approvalId: pending.approval.id, input: pending.approval.input)
        XCTAssertTrue(context.matches)
        XCTAssertFalse(context.permanentlyInvalidated)
        for linked in [false, true] {
            let covered = ManualCycleContext(
                version: 1, actorId: context.actorId, householdId: context.householdId,
                approvalId: context.approvalId, input: context.input,
                target: context.target, detail: context.detail, linked: linked)
            XCTAssertEqual(covered.matches, !linked)
            XCTAssertEqual(covered.permanentlyInvalidated, linked)
        }
        XCTAssertThrowsError(
            try context.validated(member: member, approvalId: UUID(), input: pending.approval.input))
        let root = try object(context)
        for field in ["actorId", "householdId", "approvalId"] {
            var changed = root
            changed[field] = UUID().uuidString
            let decoded: ManualCycleContext = try decode(changed)
            XCTAssertThrowsError(
                try decoded.validated(member: member, approvalId: context.approvalId, input: context.input), field)
        }
        for (field, value, permanent) in [
            ("revision", UUID().uuidString, true), ("coveredThrough", "2026-10-31", true),
            ("status", "paused", false), ("nextDueOn", "2026-11-01", false),
        ] {
            var target = try XCTUnwrap(root["target"] as? [String: Any])
            var rule = try XCTUnwrap(target["rule"] as? [String: Any])
            rule[field] = value
            target["rule"] = rule
            var changed = root
            changed["target"] = target
            let decoded: ManualCycleContext = try decode(changed)
            XCTAssertFalse(decoded.matches, field)
            XCTAssertEqual(decoded.permanentlyInvalidated, permanent, field)
        }
    }

    func testPrivateDecisionSurvivesRestartAndRequiresBoundUnusedOrRecordedAuthorityToFinish() async throws {
        let envelope = try envelope()
        let proposal = envelope.approval
        let decision = ManualCycleDecision(
            operationId: proposal.operationId, approvalId: proposal.id, input: proposal.input, approved: true)
        let review = try context(proposal)
        let url = FileManager.default.temporaryDirectory.appending(path: "manual-decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueManualCycleDecision(decision, context: review, lease: lease)
        do {
            try await first.finishManualCycleDecision(approvalId: decision.approvalId, lease: lease)
            XCTFail("Discarded unresolved approval")
        } catch OfflineFailure.invalidOperation {}
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readManualCycleDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        XCTAssertEqual(saved?.reviewedContext.detail.event.id, review.detail.event.id)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await reopened.readManualCycleDecision(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(member)
        do {
            try await reopened.retireManualCycleDecision(
                .init(context: review, fencedApproval: envelope), lease: restored)
            XCTFail("A matching current source retired uncertain intent")
        } catch OfflineFailure.invalidOperation {}
        let linked = ManualCycleContext(
            version: 1, actorId: review.actorId, householdId: review.householdId,
            approvalId: review.approvalId, input: review.input,
            target: review.target, detail: review.detail, linked: true)
        try await reopened.retireManualCycleDecision(.init(context: linked, fencedApproval: envelope), lease: restored)
        let terminal = try await reopened.readManualCycleDecision(lease: restored)
        XCTAssertTrue(terminal?.isTerminal == true)
        do {
            try await reopened.reconcileManualCycleDecision(envelope, lease: restored)
            XCTFail("Regressed immutable unused proof")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishManualCycleDecision(approvalId: decision.approvalId, lease: restored)
        try await reopened.enqueueManualCycleDecision(decision, context: review, lease: restored)
        let expiry = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId,
            command: .linkCycle, expiredUnused: true, checkedAt: "2099-01-01T00:00:00.000000Z")
        try await reopened.expireManualCycleDecision(expiry, lease: restored)
        try await reopened.finishManualCycleDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await reopened.readManualCycleDecision(lease: restored)
        XCTAssertNil(cleared)
    }

    func testUnusedConflictProofRequiresItsPrivateOwnerAndAnApprovedChoice() throws {
        let envelope = try envelope()
        let pending = envelope.approval
        let current = try context(pending)
        let linked = ManualCycleContext(
            version: 1, actorId: current.actorId, householdId: current.householdId,
            approvalId: current.approvalId, input: current.input,
            target: current.target, detail: current.detail, linked: true)
        for approved in [true, false] {
            let decision = ManualCycleDecision(
                operationId: pending.operationId, approvalId: pending.id, input: pending.input, approved: approved)
            let evidence = ManualCycleConflictEvidence(context: linked, fencedApproval: envelope)
            if approved {
                try evidence.validated(member: member, decision: decision)
            } else {
                XCTAssertThrowsError(try evidence.validated(member: member, decision: decision))
            }
            for key in ["actorId", "householdId"] {
                var root = try object(envelope)
                root[key] = UUID().uuidString
                let foreign: ManualCycleApprovalEnvelope = try decode(root)
                XCTAssertThrowsError(
                    try ManualCycleConflictEvidence(context: linked, fencedApproval: foreign)
                        .validated(member: member, decision: decision), key)
            }
        }
    }

    private func part() throws -> [String: AssistantJSON] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-manual-cycle-approval", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONDecoder().decode([[String: AssistantJSON]].self, from: Data(contentsOf: url)).first)
    }

    private func envelope() throws -> ManualCycleApprovalEnvelope {
        let part = try part()
        guard case .object(let output) = part["output"], let value = output["value"] else {
            throw NestAPIFailure.contract
        }
        return try JSONDecoder().decode(ManualCycleApprovalEnvelope.self, from: JSONEncoder().encode(value))
    }

    private func privateReceipt(_ approval: ManualCycleApproval) throws -> ManualCycleReceipt {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "manual-cycle-receipt", withExtension: "json", subdirectory: "Fixtures"))
        var root = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        root["approvalId"] = approval.id.uuidString
        return try decode(root)
    }

    private func context(_ approval: ManualCycleApproval) throws -> ManualCycleContext {
        let receipt = try privateReceipt(approval)
        let rule = RecurringRule(
            ruleId: approval.input.ruleId, revision: approval.input.expectedRevision,
            configuration: receipt.configuration, status: .active,
            authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: approval.input.dueOn)
        return .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: approval.id, input: approval.input,
            target: .init(version: 1, householdId: member.householdId, today: approval.input.dueOn, rule: rule),
            detail: receipt.linkedExpense, linked: false)
    }

    private func object<T: Encodable>(_ value: T) throws -> [String: Any] {
        try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
    }

    private func decode<T: Decodable>(_ value: [String: Any]) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: value))
    }
}
