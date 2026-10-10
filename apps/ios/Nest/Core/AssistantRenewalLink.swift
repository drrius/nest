import Foundation

enum AssistantRenewalLink {
    case renewal(RenewalReceipt)
    case reminder(RenewalReminderReceipt)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        if let saved = receipt(part, member: member) { return .renewal(saved) }
        if let saved = reminderReceipt(part, member: member) { return .reminder(saved) }
        return nil
    }

    static func reminderReceipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> RenewalReminderReceipt? {
        guard part["type"] == .string("tool-saveRenewalReminder"),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"],
            let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(RenewalReminderReceipt.self, from: data),
            (try? receipt.validated(member: member, expected: receipt.command)) != nil
        else { return nil }
        return receipt
    }

    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> RenewalReceipt? {
        guard let type = part["type"]?.string,
            ["tool-createRenewal", "tool-editRenewal", "tool-removeRenewal"].contains(type),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"],
            let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(RenewalReceipt.self, from: data),
            (try? receipt.validated(member: member, expected: receipt.command)) != nil
        else { return nil }
        switch type {
        case "tool-createRenewal" where receipt.action == .saved && receipt.command.expectedRevision == nil:
            return receipt
        case "tool-editRenewal" where receipt.action == .saved && receipt.command.expectedRevision != nil:
            return receipt
        case "tool-removeRenewal" where receipt.action == .removed: return receipt
        default: return nil
        }
    }
}
