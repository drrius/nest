import Foundation

enum AssistantVariableCycleApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeVariableCycle"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], case .object(let output) = part["output"],
            output["ok"] == .bool(true), case .object(let value) = output["value"],
            Set(input.keys) == ["ruleId", "expectedRevision", "dueOn", "amountCentimes", "allocations"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "input", "status", "expiresAt", "receipt"],
            case .object(let proposed) = approval["input"], Set(proposed.keys) == Set(input.keys),
            exactShares(input["allocations"]), exactShares(proposed["allocations"])
        else { return nil }
        do {
            let command = try JSONDecoder().decode(
                VariableCycleInput.self, from: JSONEncoder().encode(AssistantJSON.object(input)))
            let envelope = try JSONDecoder().decode(
                VariableCycleApprovalEnvelope.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.input == command else { return nil }
            return .init(
                approvalId: envelope.approval.id, command: .recordCycle, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }

    private static func exactShares(_ value: AssistantJSON?) -> Bool {
        guard case .array(let shares) = value, shares.count == 2 else { return false }
        return shares.allSatisfy {
            guard case .object(let share) = $0 else { return false }
            return Set(share.keys) == ["memberId", "centimes"]
        }
    }
}
