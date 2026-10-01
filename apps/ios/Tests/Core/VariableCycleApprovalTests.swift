import Foundation
import XCTest

@testable import NestCore

final class VariableCycleApprovalTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Fixture")

    private func parts() throws -> [[String: AssistantJSON]] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-variable-cycle-approval", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([[String: AssistantJSON]].self, from: Data(contentsOf: url))
    }

    func testCanonicalBillLinksRejectSubstitutedInputScopeAndNonce() throws {
        for part in try parts() {
            let row = try XCTUnwrap(PendingFinancialApproval.assistantLink(part, member: member))
            guard case .object(let input) = part["input"], case .object(let output) = part["output"],
                case .object(let value) = output["value"]
            else { return XCTFail("Missing wire fixture") }
            XCTAssertEqual(row.command, .recordCycle)
            for key in [
                "ruleId", "expectedRevision", "dueOn", "amountCentimes", "allocations", "operationId", "actorId",
            ] {
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
            if case .array(var shares) = input["allocations"], case .object(var first) = shares.first {
                first["operationId"] = .string(UUID().uuidString)
                shares[0] = .object(first)
                var fields = input
                fields["allocations"] = .array(shares)
                var changed = part
                changed["input"] = .object(fields)
                XCTAssertNil(PendingFinancialApproval.assistantLink(changed, member: member))
            }
        }
    }

    func testConsumedReceiptsBindExpenseCycleApprovalOperationAndAccount() throws {
        for part in try parts() {
            guard case .object(let output) = part["output"], let value = output["value"] else {
                return XCTFail("Missing approval")
            }
            let pending = try JSONDecoder().decode(
                VariableCycleApprovalEnvelope.self, from: JSONEncoder().encode(value))
            let approval = pending.approval
            let decision = VariableCycleDecision(
                operationId: approval.operationId, approvalId: approval.id, input: approval.input, approved: true)
            let config = try configuration()
            let expense = ExpenseInput(
                description: config.description, amountCentimes: approval.input.amountCentimes,
                receiptPath: nil, receiptTotalCentimes: nil, payerId: config.payerId,
                allocations: approval.input.allocations, date: approval.input.dueOn, note: nil, categoryId: nil)
            let receipt = VariableCycleReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: approval.operationId, approvalId: approval.id, source: "variable", eventId: UUID(),
                input: approval.input,
                cycle: try RecurringDates.cycle(schedule: config.schedule, dueOn: approval.input.dueOn),
                configuration: config, expense: expense)
            let result = VariableCycleApprovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approval.id, operationId: approval.operationId, input: approval.input,
                    status: .consumed, expiresAt: approval.expiresAt, receipt: receipt))
            _ = try result.matching(decision, member: member, terminal: true)
            let encoded = try JSONEncoder().encode(result)
            let root = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
            let fields = try XCTUnwrap(root["approval"] as? [String: Any])
            let recorded = try XCTUnwrap(fields["receipt"] as? [String: Any])
            for key in ["actorId", "householdId", "approvalId", "operationId", "source"] {
                var changedReceipt = recorded
                changedReceipt[key] =
                    UUID().uuidString
                var changedApproval = fields
                changedApproval["receipt"] = changedReceipt
                var changed = root
                changed["approval"] = changedApproval
                let changedData = try JSONSerialization.data(withJSONObject: changed)
                XCTAssertThrowsError(
                    try JSONDecoder().decode(VariableCycleApprovalEnvelope.self, from: changedData)
                        .matching(decision, member: member, terminal: true), key)
            }
            let denied = VariableCycleDecision(
                operationId: decision.operationId, approvalId: decision.approvalId,
                input: decision.input, approved: false)
            XCTAssertThrowsError(try result.matching(denied, member: member, terminal: true))
            for (key, field, replacement) in [
                ("input", "expectedRevision", UUID().uuidString),
                ("expense", "amountCentimes", "102"),
                ("cycle", "dueOn", "2026-11-01"),
                ("configuration", "description", "Substituted bill"),
            ] {
                var nested = try XCTUnwrap(recorded[key] as? [String: Any])
                nested[field] = replacement
                var changedReceipt = recorded
                changedReceipt[key] = nested
                var changedApproval = fields
                changedApproval["receipt"] = changedReceipt
                var changed = root
                changed["approval"] = changedApproval
                let data = try JSONSerialization.data(withJSONObject: changed)
                XCTAssertThrowsError(
                    try JSONDecoder().decode(VariableCycleApprovalEnvelope.self, from: data)
                        .matching(decision, member: member, terminal: true))
            }
        }
    }

    func testRestartKeepsExactDecisionAndReviewedDetailUntilAuthoritativeTerminalEvidence() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "state-decision-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let part = try XCTUnwrap(parts().first)
        guard case .object(let output) = part["output"], let value = output["value"] else {
            return XCTFail("Missing fixture")
        }
        let envelope = try JSONDecoder().decode(
            VariableCycleApprovalEnvelope.self, from: JSONEncoder().encode(value))
        let approval = envelope.approval
        let input = approval.input
        let rule = RecurringRule(
            ruleId: input.ruleId, revision: input.expectedRevision,
            configuration: .init(
                description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .variable, amountCentimes: nil, allocations: nil),
            status: .active, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: try CivilDate("2026-10-01"))
        let decision = VariableCycleDecision(
            operationId: approval.operationId, approvalId: approval.id, input: input, approved: true)
        let detail = RecurringDetail(
            version: 1, householdId: member.householdId, today: try CivilDate("2026-10-01"), rule: rule)
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        try await first.enqueueVariableCycleDecision(decision, detail: detail, lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readVariableCycleDecision(lease: active)
        XCTAssertEqual(saved?.decision, decision)
        XCTAssertEqual(saved?.reviewedDetail.rule, rule)
        do {
            try await store.finishVariableCycleDecision(approvalId: decision.approvalId, lease: active)
            XCTFail("Discarded unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.enqueueVariableCycleDecision(decision, detail: detail, lease: active)
            XCTFail("Overwrote unresolved decision")
        } catch OfflineFailure.invalidOperation {}
        let other = try await store.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let hidden = try await store.readVariableCycleDecision(lease: other)
        XCTAssertNil(hidden)
        do {
            _ = try await store.readVariableCycleDecision(lease: active)
            XCTFail("Old account lease read a private decision")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await store.activate(member)
        let expiry = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .recordCycle,
            expiredUnused: true, checkedAt: "2026-10-01T01:00:00.000000Z")
        let substituted = FinancialApprovalExpiry(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approvalId: decision.approvalId, operationId: decision.operationId, command: .cancelRule,
            expiredUnused: true, checkedAt: expiry.checkedAt)
        do {
            try await store.expireVariableCycleDecision(substituted, lease: restored)
            XCTFail("Another command's expiry released this decision")
        } catch NestAPIFailure.contract {}
        try await store.expireVariableCycleDecision(expiry, lease: restored)
        try await store.finishVariableCycleDecision(approvalId: decision.approvalId, lease: restored)
        let cleared = try await store.readVariableCycleDecision(lease: restored)
        XCTAssertNil(cleared)
    }
    private func configuration() throws -> RecurringConfiguration {
        .init(
            description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
            mode: .variable, amountCentimes: nil, allocations: nil)
    }

    func testConflictEvidenceSurvivesRestartAndCannotRetireAMatchingOrForeignDecision() async throws {
        let part = try XCTUnwrap(parts().first)
        guard case .object(let output) = part["output"], let value = output["value"] else {
            return XCTFail("Missing fixture")
        }
        let envelope = try JSONDecoder().decode(VariableCycleApprovalEnvelope.self, from: JSONEncoder().encode(value))
        let decision = VariableCycleDecision(
            operationId: envelope.approval.operationId, approvalId: envelope.approval.id,
            input: envelope.approval.input, approved: true)
        let url = FileManager.default.temporaryDirectory.appending(path: "variable-conflict-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(member)
        let current = try detail(decision.input, revision: decision.input.expectedRevision)
        try await first.enqueueVariableCycleDecision(decision, detail: current, lease: lease)
        let matching = VariableCycleConflictEvidence(detail: current, fencedApproval: envelope)
        do {
            try await first.retireVariableCycleDecision(matching, lease: lease)
            XCTFail("Matching cycle released uncertain intent")
        } catch OfflineFailure.invalidOperation {}
        let changed = try detail(decision.input, revision: UUID())
        let foreign = VariableCycleApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: UUID(), approval: envelope.approval)
        do {
            try await first.retireVariableCycleDecision(
                .init(detail: changed, fencedApproval: foreign), lease: lease)
            XCTFail("Foreign proof released private intent")
        } catch NestAPIFailure.contract {}
        try await first.retireVariableCycleDecision(.init(detail: changed, fencedApproval: envelope), lease: lease)
        let store = try ChoreOfflineStore(url: url)
        let active = try await store.activate(member)
        let saved = try await store.readVariableCycleDecision(lease: active)
        XCTAssertTrue(saved?.isTerminal == true)
        XCTAssertEqual(saved?.decision, decision)
        XCTAssertEqual(saved?.conflict?.detail.rule.revision, changed.rule.revision)
        do {
            try await store.reconcileVariableCycleDecision(envelope, lease: active)
            XCTFail("A later read regressed terminal unused proof")
        } catch OfflineFailure.invalidOperation {}
        try await store.finishVariableCycleDecision(approvalId: decision.approvalId, lease: active)
        let cleared = try await store.readVariableCycleDecision(lease: active)
        XCTAssertNil(cleared)
    }

    private func detail(_ input: VariableCycleInput, revision: UUID) throws -> RecurringDetail {
        let rule = RecurringRule(
            ruleId: input.ruleId, revision: revision, configuration: try configuration(), status: .active,
            authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: input.dueOn)
        return .init(version: 1, householdId: member.householdId, today: input.dueOn, rule: rule)
    }

}
