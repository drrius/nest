import Foundation
import XCTest

@testable import NestCore

final class RecurringResumeApprovalTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Fixture")

    private func parts() throws -> [[String: AssistantJSON]] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-recurring-resume-approval", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([[String: AssistantJSON]].self, from: Data(contentsOf: url))
    }

    func testCanonicalResumeLinksRejectSubstitutedInputScopeDatesAndNonce() throws {
        for part in try parts() {
            let row = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: member))
            guard case .object(let input) = part["input"], case .object(let output) = part["output"],
                case .object(let value) = output["value"]
            else { return XCTFail("Missing wire fixture") }
            XCTAssertEqual(row.command, .resumeRule)
            for key in ["ruleId", "expectedRevision", "expectedStatus", "action", "resumeFrom", "firstDueOn", "operationId", "actorId"] {
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
                RecurringResumeApprovalEnvelope.self, from: JSONEncoder().encode(value))
            let approval = pending.approval
            let decision = RecurringResumeDecision(
                operationId: approval.operationId, approvalId: approval.id, change: approval.change, approved: true)
            let receipt = RecurringResumeReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: approval.operationId, approvalId: approval.id, revision: UUID(),
                status: .active, change: approval.change, configuration: try configuration(), coveredThrough: nil)
            let result = RecurringResumeApprovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approval.id, operationId: approval.operationId, change: approval.change,
                    status: .consumed, expiresAt: approval.expiresAt, reviewedOn: approval.reviewedOn, receipt: receipt))
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
                    try JSONDecoder().decode(RecurringResumeApprovalEnvelope.self, from: changedData)
                        .matching(decision, member: member, terminal: true), key)
            }
            let denied = RecurringResumeDecision(
                operationId: decision.operationId, approvalId: decision.approvalId,
                change: decision.change, approved: false)
            XCTAssertThrowsError(try result.matching(denied, member: member, terminal: true))
        }
    }

    func testRestartKeepsExactDecisionAndReviewedRuleUntilAuthoritativeTerminalEvidence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "resume-decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let change = RecurringResumeInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: "paused", action: "resume",
            resumeFrom: try CivilDate("2026-10-05"), firstDueOn: try CivilDate("2026-11-01"))
        let rule = RecurringRule(
            ruleId: change.ruleId, revision: change.expectedRevision,
            configuration: try configuration(),
            status: .paused, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: nil)
        let decision = RecurringResumeDecision(operationId: UUID(), approvalId: UUID(), change: change, approved: true)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueRecurringResumeDecision(decision, rule: rule, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readRecurringResumeDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        XCTAssertEqual(saved?.reviewedRule, rule)
        do {
            try await store.finishRecurringResumeDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.enqueueRecurringResumeDecision(decision, rule: rule, lease: active)
            XCTFail("Overwrote unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readRecurringResumeDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readRecurringResumeDecision(lease: active)
            XCTFail("Old account lease read a private decision")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let expiry = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .resumeRule,
            expiredUnused: true, checkedAt: "2026-10-01T01:00:00.000000Z")
        let substituted = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .cancelRule,
            expiredUnused: true, checkedAt: expiry.checkedAt)
        do {
            try await store.expireRecurringResumeDecision(substituted, lease: restored)
            XCTFail("Another command's expiry released this decision")
        } catch NestAPIFailure.contract {}
        try await store.expireRecurringResumeDecision(expiry, lease: restored)
        try await store.finishRecurringResumeDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readRecurringResumeDecision(lease: restored)
        XCTAssertNil(cleared)
    }

    private func configuration() throws -> RecurringConfiguration {
        .init(
            description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
            mode: .variable, amountCentimes: nil, allocations: nil)
    }

    func testFencedPassedDateRetiresOnlyApprovedIntentAndCannotRegressToReceipt() async throws {
        for approved in [true, false] {
            let url = FileManager.default.temporaryDirectory.appending(path: "resume-date-\(UUID()).sqlite")
            defer { try? FileManager.default.removeItem(at: url) }
            let change = RecurringResumeInput(
                ruleId: UUID(), expectedRevision: UUID(), expectedStatus: "paused", action: "resume",
                resumeFrom: try CivilDate("2026-10-05"), firstDueOn: try CivilDate("2026-11-01"))
            let rule = RecurringRule(
                ruleId: change.ruleId, revision: change.expectedRevision, configuration: try configuration(),
                status: .paused, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
                coveredThrough: nil, nextDueOn: nil)
            let decision = RecurringResumeDecision(
                operationId: UUID(), approvalId: UUID(), change: change, approved: approved)
            let store = try ChoreOfflineStore(url: url)
            let lease = try await store.activate(member)
            try await store.enqueueRecurringResumeDecision(decision, rule: rule, lease: lease)
            let evidence = RecurringResumeApprovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: decision.approvalId, operationId: decision.operationId, change: change, status: .pending,
                    expiresAt: "2099-01-01T00:00:00.000000Z", reviewedOn: try CivilDate("2026-10-06"), receipt: nil))
            try await store.reconcileRecurringResumeDecision(evidence, lease: lease)
            let saved = try await store.readRecurringResumeDecision(lease: lease)
            XCTAssertEqual(saved?.datePassedUnused, approved)
            XCTAssertEqual(saved?.isTerminal, approved)
            if approved {
                let earlier = RecurringResumeApprovalEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    approval: .init(
                        id: decision.approvalId, operationId: decision.operationId, change: change, status: .pending,
                        expiresAt: evidence.approval.expiresAt, reviewedOn: change.resumeFrom, receipt: nil))
                do {
                    try await store.reconcileRecurringResumeDecision(earlier, lease: lease)
                    XCTFail("Regressed authoritative passed-date evidence")
                } catch OfflineFailure.invalidOperation {}
                try await store.finishRecurringResumeDecision(approvalId: decision.approvalId, lease: lease)
            } else {
                do {
                    try await store.finishRecurringResumeDecision(approvalId: decision.approvalId, lease: lease)
                    XCTFail("Discarded a decline merely because its date passed")
                } catch OfflineFailure.invalidOperation {}
            }
        }
    }
}
