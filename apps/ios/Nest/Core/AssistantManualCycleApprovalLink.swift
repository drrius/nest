import Foundation

enum AssistantManualCycleApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeManualCycle"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], case .object(let output) = part["output"],
            output["ok"] == .bool(true), case .object(let value) = output["value"],
            Set(input.keys) == ["ruleId", "expectedRevision", "dueOn", "sourceEventId"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "input", "status", "expiresAt", "receipt"],
            case .object(let proposed) = approval["input"], Set(proposed.keys) == Set(input.keys)
        else { return nil }
        do {
            let command = try JSONDecoder().decode(
                ManualCycleInput.self, from: JSONEncoder().encode(AssistantJSON.object(input)))
            let envelope = try JSONDecoder().decode(
                ManualCycleApprovalEnvelope.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.input == command else { return nil }
            return .init(
                approvalId: envelope.approval.id, command: .linkCycle, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }

}
