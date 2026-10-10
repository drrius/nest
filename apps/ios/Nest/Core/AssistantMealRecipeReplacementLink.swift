import Foundation

enum AssistantMealRecipeReplacementLink {
    static func receipt(_ part: [String: AssistantJSON], member: VerifiedMember) -> MealRecipeReplacementReceipt? {
        guard part["type"] == .string("tool-replaceWithRecipe"),
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"], let data = try? JSONEncoder().encode(value),
            let receipt = try? JSONDecoder().decode(MealRecipeReplacementReceipt.self, from: data),
            case .object(var input) = part["input"], input["operationId"] == nil
        else { return nil }
        input["operationId"] = .string(receipt.operationId.uuidString)
        guard let commandData = try? JSONEncoder().encode(AssistantJSON.object(input)),
            let command = try? JSONDecoder().decode(ReplaceSavedRecipe.self, from: commandData)
        else { return nil }
        return try? receipt.validated(member: member, command: command)
    }
}
