import Foundation

enum AssistantLegacyDismissalApprovalLink {
    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> PendingFinancialApproval? {
        guard part["type"] == .string("tool-proposeLegacyDismissal"), part["state"] == .string("output-available"),
            case .object(let input) = part["input"], Set(input.keys) == ["draftId"],
            case .string(let draftId) = input["draftId"], let draft = UUID(uuidString: draftId),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"],
            Set(value.keys) == ["version", "actorId", "householdId", "approval"],
            case .object(let approval) = value["approval"],
            Set(approval.keys) == ["id", "operationId", "input", "status", "expiresAt", "receipt"],
            case .object(let proposed) = approval["input"], Set(proposed.keys) == ["draftId", "ruleId", "reviewToken"]
        else { return nil }
        do {
            let envelope = try JSONDecoder().decode(
                LegacyDismissalApprovalEnvelope.self, from: JSONEncoder().encode(AssistantJSON.object(value)))
            _ = try envelope.validated(member: member, approvalId: envelope.approval.id)
            guard envelope.approval.input.draftId == draft else { return nil }
            return .init(
                approvalId: envelope.approval.id, command: .dismissLegacy, expiresAt: envelope.approval.expiresAt)
        } catch { return nil }
    }
}
