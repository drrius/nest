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
        // Success belongs to typed, command-bound rows. A rejected result must not regain success here.
        return nil
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
}
