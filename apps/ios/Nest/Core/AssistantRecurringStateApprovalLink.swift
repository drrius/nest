import Foundation

enum AssistantRecurringStateApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeRecurringState"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], case .object(let output) = part["output"],
            output["ok"] == .bool(true), case .object(let value) = output["value"],
            Set(input.keys) == ["ruleId", "expectedRevision", "expectedStatus", "action"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "change", "status", "expiresAt", "receipt"],
            case .object(let change) = approval["change"], Set(change.keys) == Set(input.keys)
        else { return nil }
        do {
            let command = try JSONDecoder().decode(
                RecurringStateInput.self, from: JSONEncoder().encode(AssistantJSON.object(input)))
            let envelope = try JSONDecoder().decode(
                RecurringStateApprovalEnvelope.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.change == command else { return nil }
            return .init(
                approvalId: envelope.approval.id, command: command.command, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }
}
