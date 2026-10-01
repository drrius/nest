import Foundation

enum AssistantLegacyRecurringLink: Equatable {
    case rules
    case drafts(UUID)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard part["state"] == .string("output-available"), case .object(let input) = part["input"],
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            case .object(let value) = output["value"]
        else { return nil }
        do {
            let after = try cursor(input["after"])
            let data = try JSONEncoder().encode(AssistantJSON.object(value))
            switch part["type"]?.string {
            case "tool-listLegacyRecurringRules":
                guard Set(input.keys) == ["after"],
                    Set(value.keys) == ["version", "householdId", "after", "next", "rules"]
                else { return nil }
                _ = try JSONDecoder().decode(LegacyRecurringList.self, from: data)
                    .validated(member: member, after: after)
                return .rules
            case "tool-listLegacyRecurringDrafts":
                guard Set(input.keys) == ["ruleId", "after"],
                    Set(value.keys) == ["version", "householdId", "ruleId", "after", "next", "drafts"]
                else { return nil }
                let ruleId = try uuid(input["ruleId"])
                _ = try JSONDecoder().decode(LegacyDraftList.self, from: data)
                    .validated(member: member, ruleId: ruleId, after: after)
                return .drafts(ruleId)
            default: return nil
            }
        } catch { return nil }
    }

    private static func cursor(_ value: AssistantJSON?) throws -> UUID? {
        if value == .null { return nil }
        return try uuid(value)
    }

    private static func uuid(_ value: AssistantJSON?) throws -> UUID {
        guard let text = value?.string, let id = UUID(uuidString: text), id.uuidString.lowercased() == text else {
            throw NestAPIFailure.contract
        }
        return id
    }
}
