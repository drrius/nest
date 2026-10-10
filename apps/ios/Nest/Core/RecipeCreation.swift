import Foundation

public struct RecipeIngredientDraft: Codable, Equatable, Sendable {
    public let name: String
    public let quantity: String?
    public let unit: String?
    public let categoryId: UUID?
    public let note: String?

    enum CodingKeys: String, CodingKey { case name, quantity, unit, categoryId, note }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(name, forKey: .name)
        try values.encode(quantity, forKey: .quantity)
        try values.encode(unit, forKey: .unit)
        try values.encode(categoryId, forKey: .categoryId)
        try values.encode(note, forKey: .note)
    }

    func validated() throws {
        guard RecipeDraft.validText(name, maximum: 120),
            quantity.map({ RecipeDraft.validText($0, maximum: 80) }) ?? true,
            unit.map({ RecipeDraft.validText($0, maximum: 80) }) ?? true,
            note.map({ RecipeDraft.validText($0, maximum: 1000) }) ?? true
        else { throw MealContractError.invalidPlacement }
    }
}

public struct RecipeDraft: Codable, Equatable, Sendable {
    public let title: String
    public let servings: Int
    public let instructions: String
    public let recipeUrl: String?
    public let notes: String?
    public let ingredients: [RecipeIngredientDraft]

    enum CodingKeys: String, CodingKey { case title, servings, instructions, recipeUrl, notes, ingredients }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(title, forKey: .title)
        try values.encode(servings, forKey: .servings)
        try values.encode(instructions, forKey: .instructions)
        try values.encode(recipeUrl, forKey: .recipeUrl)
        try values.encode(notes, forKey: .notes)
        try values.encode(ingredients, forKey: .ingredients)
    }

    func validated() throws -> Self {
        guard Self.validText(title, maximum: 120), (1...2_147_483_647).contains(servings),
            Self.validText(instructions, maximum: 4000),
            notes.map({ Self.validText($0, maximum: 4000) }) ?? true,
            recipeUrl.map(Self.validURL) ?? true, (1...200).contains(ingredients.count)
        else { throw MealContractError.invalidPlacement }
        for ingredient in ingredients { try ingredient.validated() }
        return self
    }

    static func validText(_ value: String, maximum: Int) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && value.utf16.count <= maximum && !value.contains("\0")
    }

    static func validURL(_ value: String) -> Bool {
        guard validText(value, maximum: 2000),
            value.range(
                of: #"^https?://[^/?#@\\\s]+(?:[/?#][^\s\\]*)?$"#,
                options: [.regularExpression, .caseInsensitive]) != nil
        else { return false }
        return value.unicodeScalars.allSatisfy { $0.value > 32 && ($0.value < 127 || $0.value > 159) }
    }
}

public struct CreateRecipe: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let expectedRevision: String
    public let recipe: RecipeDraft

    func validated() throws -> Self {
        _ = try recipe.validated()
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision),
            revision <= Int64.max - Int64(recipe.ingredients.count + 1)
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct RecipeCreationReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let definitionId: UUID
    public let revision: String

    func validated(member: VerifiedMember, command: CreateRecipe) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, let previous = Int64(command.expectedRevision),
            revision == String(previous + Int64(command.recipe.ingredients.count + 1))
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct RecipeCreationEnvelope: Decodable {
    let version: Int
    let receipt: RecipeCreationReceipt
}
