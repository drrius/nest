import Foundation
import XCTest

@testable import NestCore

final class RecurringStateApprovalTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Fixture")

    private func parts() throws -> [[String: AssistantJSON]] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-recurring-state-approval", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([[String: AssistantJSON]].self, from: Data(contentsOf: url))
    }

    func testCanonicalPauseAndCancelLinksRejectSubstitutedInputScopeAndNonce() throws {
        for part in try parts() {
            let row = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: member))
            guard case .object(let input) = part["input"], case .object(let output) = part["output"],
                case .object(let value) = output["value"]
            else { return XCTFail("Missing wire fixture") }
            XCTAssertEqual(row.command, input["action"] == .string("pause") ? .pauseRule : .cancelRule)
            for key in ["ruleId", "expectedRevision", "expectedStatus", "action", "operationId", "actorId"] {
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
            var missing = part
            missing.removeValue(forKey: "input")
            XCTAssertNil(PendingFinancialApproval.assistantLink(missing, member: member))
            missing = part
            missing["state"] = .string("input-available")
            XCTAssertNil(PendingFinancialApproval.assistantLink(missing, member: member))
        }
    }

    func testConsumedReceiptsBindOperationApprovalActionRevisionAndAccount() throws {
        for part in try parts() {
            guard case .object(let output) = part["output"], let value = output["value"] else {
                return XCTFail("Missing approval")
            }
            let pending = try JSONDecoder().decode(
                RecurringStateApprovalEnvelope.self, from: JSONEncoder().encode(value))
            let approval = pending.approval
            let decision = RecurringStateDecision(
                operationId: approval.operationId, approvalId: approval.id, change: approval.change, approved: true)
            let receipt = RecurringStateReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: approval.operationId, approvalId: approval.id, revision: UUID(),
                status: approval.change.action == .pause ? .paused : .cancelled, change: approval.change)
            let result = RecurringStateApprovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approval.id, operationId: approval.operationId, change: approval.change,
                    status: .consumed, expiresAt: approval.expiresAt, receipt: receipt))
            _ = try result.matching(decision, member: member, terminal: true)
            let encoded = try JSONEncoder().encode(result)
            let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
            let fields = try XCTUnwrap(root["approval"] as? [String: Any])
            let recorded = try XCTUnwrap(fields["receipt"] as? [String: Any])
            for key in ["actorId", "householdId", "approvalId", "operationId", "revision", "status"] {
                var changedReceipt = recorded
                changedReceipt[key] =
                    key == "revision" ? approval.change.expectedRevision.uuidString : UUID().uuidString
                var changedApproval = fields
                changedApproval["receipt"] = changedReceipt
                var changed = root
                changed["approval"] = changedApproval
                let changedData = try JSONSerialization.data(withJSONObject: changed)
                XCTAssertThrowsError(
                    try JSONDecoder().decode(RecurringStateApprovalEnvelope.self, from: changedData)
                        .matching(decision, member: member, terminal: true), key)
            }
            let denied = RecurringStateDecision(
                operationId: decision.operationId, approvalId: decision.approvalId,
                change: decision.change, approved: false)
            XCTAssertThrowsError(try result.matching(denied, member: member, terminal: true))
        }
    }

    func testRestartKeepsExactDecisionAndReviewedRuleUntilAuthoritativeTerminalEvidence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "state-decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let change = RecurringStateInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: .active, action: .pause)
        let rule = RecurringRule(
            ruleId: change.ruleId, revision: change.expectedRevision,
            configuration: .init(
                description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .variable, amountCentimes: nil, allocations: nil),
            status: .active, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: try CivilDate("2026-10-01"))
        let decision = RecurringStateDecision(operationId: UUID(), approvalId: UUID(), change: change, approved: true)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurringStateDecision(decision, rule: rule, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readRecurringStateDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        XCTAssertEqual(saved?.reviewedRule, rule)
        do {
            try await store.finishRecurringStateDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.enqueueRecurringStateDecision(decision, rule: rule, lease: active)
            XCTFail("Overwrote unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readRecurringStateDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readRecurringStateDecision(lease: active)
            XCTFail("Old account lease read a private decision")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let expiry = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .pauseRule,
            expiredUnused: true, checkedAt: "2026-10-01T01:00:00.000000Z")
        let substituted = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .cancelRule,
            expiredUnused: true, checkedAt: expiry.checkedAt)
        do {
            try await store.expireRecurringStateDecision(substituted, lease: restored)
            XCTFail("Another command's expiry released this decision")
        } catch NestAPIFailure.contract {}
        try await store.expireRecurringStateDecision(expiry, lease: restored)
        try await store.finishRecurringStateDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readRecurringStateDecision(lease: restored)
        XCTAssertNil(cleared)
    }
}
