import Foundation

extension PendingFinancialApproval {
    static func assistantLink(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        if part["type"] == .string("tool-proposeLegacyAdoption") {
            return AssistantLegacyAdoptionApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeLegacyConfirmation") {
            return AssistantLegacyConfirmationApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeLegacyDismissal") {
            return AssistantLegacyDismissalApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeManualCycle") {
            return AssistantManualCycleApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeVariableCycle") {
            return AssistantVariableCycleApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeRecurringState") {
            return AssistantRecurringStateApprovalLink.read(part, member: member)
        }
        if part["type"] == .string("tool-proposeRecurringResume") {
            return AssistantRecurringResumeApprovalLink.read(part, member: member)
        }
        return financialLink(part, member: member)
    }

    private static func financialLink(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        let commands: [String: Command] = [
            "tool-proposeExpense": .expense, "tool-proposeRefund": .refund,
            "tool-proposeSettlement": .settlement, "tool-proposeCorrection": .correction,
            "tool-proposeRecurring": .createRule,
        ]
        guard part["state"] == .string("output-available"), let type = part["type"]?.string,
            let command = commands[type], case .object(let output) = part["output"],
            output["ok"] == .bool(true), case .object(let value) = output["value"],
            UUID(uuidString: value["actorId"]?.string ?? "") == member.userId,
            UUID(uuidString: value["householdId"]?.string ?? "") == member.householdId,
            case .object(let approval) = value["approval"],
            let id = UUID(uuidString: approval["id"]?.string ?? ""),
            let expiry = approval["expiresAt"]?.string, ApprovalTime.date(expiry) != nil
        else { return nil }
        var resolved = command
        if command == .createRule, case .object(let rule) = approval["rule"],
            rule["expectedRevision"]?.string != nil
        {
            resolved = .updateRule
        }
        return Self(approvalId: id, command: resolved, expiresAt: expiry)
    }
}
