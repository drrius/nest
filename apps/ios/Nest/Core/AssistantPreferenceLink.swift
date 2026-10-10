import Foundation

enum AssistantPreferenceLink {
    case food(FoodPreferenceReceipt)
    case cooking(CookingSaveReceipt)
    case notifications(NotificationPreferenceReceipt)
    case removedMemory(MemoryReceipt)

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        do {
            let (type, input, output) = try decoded(part)
            let decoder = JSONDecoder()
            switch type {
            case "tool-saveFoodPreferences":
                let command = try decoder.decode(SaveFoodPreferences.self, from: input).validated()
                let receipt = try decoder.decode(FoodPreferenceReceipt.self, from: output)
                return .food(try receipt.validated(member: member, command: command))
            case "tool-saveCookingPreferences":
                let command = try decoder.decode(SaveCookingProfile.self, from: input).validated()
                let receipt = try decoder.decode(CookingSaveReceipt.self, from: output)
                return .cooking(try receipt.validated(member: member, command: command))
            case "tool-saveNotificationPreferences":
                let command = try decoder.decode(SaveNotificationPreferences.self, from: input).validated()
                let receipt = try decoder.decode(NotificationPreferenceReceipt.self, from: output)
                return .notifications(try receipt.validated(member: member, command: command))
            case "tool-removeMemory":
                let command = try decoder.decode(RemoveMemory.self, from: input)
                guard command.expectedRevision != "0" else { return nil }
                let receipt = try decoder.decode(MemoryReceipt.self, from: output)
                return .removedMemory(
                    try receipt.validated(
                        member: member, operation: command.operationId, memory: command.memoryId,
                        expected: command.expectedRevision, removed: true))
            default: return nil
            }
        } catch { return nil }
    }

    private static func decoded(_ part: [String: AssistantJSON]) throws -> (String, Data, Data) {
        guard let type = part["type"]?.string, part["state"] == .string("output-available"),
            case .object(var input) = part["input"], case .object(let output) = part["output"],
            output["ok"] == .bool(true), case .object(let value) = output["value"]
        else { throw NestAPIFailure.contract }
        let receiptKeys: Set<String> = ["actorId", "householdId", "operationId", "revision"]
        let memory = type == "tool-removeMemory"
        guard Set(input.keys) == (memory ? ["memoryId", "expectedRevision"] : ["expectedRevision", "preferences"]),
            Set(value.keys) == (memory ? receiptKeys.union(["memoryId", "removed"]) : receiptKeys),
            let nonce = value["operationId"]?.string, UUID(uuidString: nonce) != nil
        else { throw NestAPIFailure.contract }
        if !memory { try preferences(input["preferences"], type: type) }
        // The nonce is issued by the authorized command, never supplied by the model.
        input["operationId"] = .string(nonce)
        return (
            type, try JSONEncoder().encode(AssistantJSON.object(input)),
            try JSONEncoder().encode(AssistantJSON.object(value))
        )
    }

    private static func preferences(_ value: AssistantJSON?, type: String) throws {
        let keys: Set<String>
        switch type {
        case "tool-saveFoodPreferences": keys = ["restrictions", "dislikes", "calorieGoal", "portions"]
        case "tool-saveCookingPreferences": keys = ["cookingNotes", "mealSlots"]
        case "tool-saveNotificationPreferences":
            keys = ["dailySummaryEnabled", "dailySummaryTime", "itemRemindersEnabled"]
        default: throw NestAPIFailure.contract
        }
        guard case .object(let fields) = value, Set(fields.keys) == keys else { throw NestAPIFailure.contract }
    }
}
