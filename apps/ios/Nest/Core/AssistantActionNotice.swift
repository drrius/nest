import Foundation

enum AssistantActionNotice {
    static func text(_ part: [String: AssistantJSON]) -> String? {
        guard let type = part["type"]?.string, type.hasPrefix("tool-") else { return nil }
        if part["state"] == .string("output-error") {
            return "This action could not be confirmed. Check its current state before retrying."
        }
        guard part["state"] == .string("output-available"), case .object(let output) = part["output"] else {
            return nil
        }
        if output["ok"] == .bool(false) {
            return failure(output["code"]?.string)
        }
        guard output["ok"] == .bool(true), case .object(let value) = output["value"] else { return nil }
        return grocery(type, value: value)
    }

    private static func failure(_ code: String?) -> String {
        switch code {
        case "forbidden": return "You no longer have permission for this action."
        case "conflict": return "This item changed. Open it to review its current state."
        case "approval_required": return "This action needs your approval."
        case "native_required": return "Continue this action in the app."
        default: return "This action could not be confirmed. Check its current state before retrying."
        }
    }

    private static func groceryChecked(_ value: [String: AssistantJSON]) -> Bool? {
        guard UUID(uuidString: value["operation"]?.string ?? "") != nil,
            UUID(uuidString: value["target"]?.string ?? "") != nil,
            let revision = value["version"]?.string, MealRevision.valid(revision), revision != "0",
            case .bool(let checked) = value["checked"]
        else { return nil }
        return checked
    }

    private static func grocery(_ type: String, value: [String: AssistantJSON]) -> String? {
        guard let checked = groceryChecked(value) else { return nil }
        if type == "tool-checkGrocery" {
            guard ["applied", "already_applied"].contains(value["outcome"]?.string ?? "") else { return nil }
            return checked ? "Grocery checked off." : "Grocery marked as needed."
        }
        guard case .bool(let removed) = value["removed"] else { return nil }
        switch type {
        case "tool-addGrocery" where !removed: return "Grocery added."
        case "tool-editGrocery" where !removed: return "Grocery updated."
        case "tool-removeGrocery" where removed: return "Grocery removed."
        default: return nil
        }
    }
}
