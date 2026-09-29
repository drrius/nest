import Foundation

enum AssistantMemoryLink {
    static func approvalId(_ part: [String: AssistantJSON], member: VerifiedMember) -> UUID? {
        guard part["type"] == .string("tool-proposeMemory"), part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"], value["version"] == .number(1),
            UUID(uuidString: value["actorId"]?.string ?? "") == member.userId,
            UUID(uuidString: value["householdId"]?.string ?? "") == member.householdId,
            case .object(let approval) = value["approval"],
            let id = UUID(uuidString: approval["id"]?.string ?? "")
        else { return nil }
        return id
    }
}
