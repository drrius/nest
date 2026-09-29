import Foundation

enum AssistantChoreReminderLink {
    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> ChoreReminderReceipt? {
        guard part["type"] == .string("tool-saveChoreReminder"),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"],
            let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(ChoreReminderReceipt.self, from: data),
            (try? receipt.validated(member: member, expected: receipt.command)) != nil
        else { return nil }
        return receipt
    }
}
