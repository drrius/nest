import Foundation

enum AssistantGroceryReminderLink {
    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> GroceryReminderReceipt? {
        guard part["type"] == .string("tool-saveGroceryReminder"),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"],
            let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(GroceryReminderReceipt.self, from: data),
            (try? receipt.validated(member: member, expected: receipt.command)) != nil
        else { return nil }
        return receipt
    }
}
