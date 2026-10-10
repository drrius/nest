import Foundation

public struct ReviewedMealIngredient: Codable, Equatable, Sendable {
    public let entryId: UUID
    public let ingredientId: UUID
    public var quantity: String?
    public var unit: String?

    public var source: MealIngredientSource { .init(entryId: entryId, ingredientId: ingredientId) }

    enum CodingKeys: String, CodingKey { case entryId, ingredientId, quantity, unit }

    public func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(entryId, forKey: .entryId)
        try fields.encode(ingredientId, forKey: .ingredientId)
        try fields.encode(quantity, forKey: .quantity)
        try fields.encode(unit, forKey: .unit)
    }
}

public struct AddMealIngredients: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let weekStart: MealWeekStart
    public let expectedRevision: String
    public let selected: [ReviewedMealIngredient]

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), (1...4200).contains(selected.count),
            Set(selected.map(\.source)).count == selected.count,
            selected.allSatisfy({
                MealLibraryText.valid($0.quantity, maximum: 80) && MealLibraryText.valid($0.unit, maximum: 80)
            })
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealIngredientAddition: Codable, Equatable, Sendable {
    public enum Outcome: String, Codable, Sendable {
        case added
        case alreadyAdded = "already_added"
    }
    public let entryId: UUID
    public let ingredientId: UUID
    public let itemId: UUID
    public let outcome: Outcome
    public var source: MealIngredientSource { .init(entryId: entryId, ingredientId: ingredientId) }
}

public struct MealIngredientsReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let weekStart: MealWeekStart
    public let weekRevision: String
    public let ingredients: [MealIngredientAddition]

    func validated(member: VerifiedMember, command: AddMealIngredients) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, weekStart == command.weekStart,
            weekRevision == command.expectedRevision,
            ingredients.map(\.source) == command.selected.map(\.source),
            Set(ingredients.map(\.itemId)).count == ingredients.count
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct MealIngredientsEnvelope: Decodable {
    let version: Int
    let receipt: MealIngredientsReceipt
}
