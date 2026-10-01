import Foundation

struct AssistantRecipeLink: Equatable, Sendable {
    enum Action: Sendable { case saved, archived }
    let definitionId: UUID
    let action: Action

    static func read(_ part: [String: AssistantJSON], member: VerifiedMember) -> Self? {
        guard let type = part["type"]?.string,
            part["state"] == .string("output-available"),
            case .object(let output) = part["output"], output["ok"] == .bool(true),
            let value = output["value"], let data = try? JSONEncoder().encode(value)
        else { return nil }
        do {
            switch type {
            case "tool-createRecipe": return try creation(data, part: part, member: member)
            case "tool-editRecipe": return try edit(data, part: part, member: member)
            case "tool-archiveRecipe": return try archive(data, part: part, member: member)
            default: return nil
            }
        } catch { return nil }
    }

    private static func creation(_ data: Data, part: [String: AssistantJSON], member: VerifiedMember) throws -> Self {
        let receipt = try JSONDecoder().decode(RecipeCreationReceipt.self, from: data)
        let input = try commandData(part, operation: receipt.operationId)
        let command = try JSONDecoder().decode(CreateRecipe.self, from: input)
        _ = try receipt.validated(member: member, command: command)
        return Self(definitionId: receipt.definitionId, action: .saved)
    }

    private static func edit(_ data: Data, part: [String: AssistantJSON], member: VerifiedMember) throws -> Self {
        let receipt = try JSONDecoder().decode(RecipeEditReceipt.self, from: data)
        let input = try commandData(part, operation: receipt.operationId)
        let command = try JSONDecoder().decode(EditRecipe.self, from: input)
        _ = try receipt.validated(member: member, command: command)
        return Self(definitionId: receipt.definitionId, action: .saved)
    }

    private static func archive(_ data: Data, part: [String: AssistantJSON], member: VerifiedMember) throws -> Self {
        let receipt = try JSONDecoder().decode(RecipeArchiveReceipt.self, from: data)
        let input = try commandData(part, operation: receipt.operationId)
        let command = try JSONDecoder().decode(ArchiveRecipe.self, from: input)
        _ = try receipt.validated(member: member, command: command)
        return Self(definitionId: receipt.definitionId, action: .archived)
    }

    private static func commandData(_ part: [String: AssistantJSON], operation: UUID) throws -> Data {
        guard case .object(var input) = part["input"], input["operationId"] == nil
        else { throw MealContractError.invalidReceipt }
        input["operationId"] = .string(operation.uuidString)
        return try JSONEncoder().encode(AssistantJSON.object(input))
    }
}
