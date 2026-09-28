import Foundation

public struct RecipeMetadataPatch: Codable, Equatable, Sendable {
    public var title: String?
    public var servings: Int??
    public var instructions: String??
    public var recipeUrl: String??
    public var notes: String??

    enum CodingKeys: String, CodingKey { case title, servings, instructions, recipeUrl, notes }

    public init(
        title: String? = nil, servings: Int?? = nil, instructions: String?? = nil,
        recipeUrl: String?? = nil, notes: String?? = nil
    ) {
        self.title = title
        self.servings = servings
        self.instructions = instructions
        self.recipeUrl = recipeUrl
        self.notes = notes
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        title = try values.decodeIfPresent(String.self, forKey: .title)
        servings = values.contains(.servings) ? .some(try values.decodeIfPresent(Int.self, forKey: .servings)) : nil
        instructions =
            values.contains(.instructions) ? .some(try values.decodeIfPresent(String.self, forKey: .instructions)) : nil
        recipeUrl =
            values.contains(.recipeUrl) ? .some(try values.decodeIfPresent(String.self, forKey: .recipeUrl)) : nil
        notes = values.contains(.notes) ? .some(try values.decodeIfPresent(String.self, forKey: .notes)) : nil
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(title, forKey: .title)
        if let servings { try values.encode(servings, forKey: .servings) }
        if let instructions { try values.encode(instructions, forKey: .instructions) }
        if let recipeUrl { try values.encode(recipeUrl, forKey: .recipeUrl) }
        if let notes { try values.encode(notes, forKey: .notes) }
    }

    var hasChange: Bool { title != nil || servings != nil || instructions != nil || recipeUrl != nil || notes != nil }

    func validated() throws {
        guard title.map({ RecipeDraft.validText($0, maximum: 120) }) ?? true,
            servings.flatMap({ $0 }).map({ (1...2_147_483_647).contains($0) }) ?? true,
            instructions.flatMap({ $0 }).map({ RecipeDraft.validText($0, maximum: 4000) }) ?? true,
            recipeUrl.flatMap({ $0 }).map(RecipeDraft.validURL) ?? true,
            notes.flatMap({ $0 }).map({ RecipeDraft.validText($0, maximum: 4000) }) ?? true
        else { throw MealContractError.invalidPlacement }
    }
}

public struct EditRecipe: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let definitionId: UUID
    public let expectedRevision: String
    public let patch: RecipeMetadataPatch
    public let ingredients: [RecipeIngredientSelection]?

    enum CodingKeys: String, CodingKey { case operationId, definitionId, expectedRevision, patch, ingredients }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(definitionId, forKey: .definitionId)
        try values.encode(expectedRevision, forKey: .expectedRevision)
        try values.encode(patch, forKey: .patch)
        try values.encode(ingredients, forKey: .ingredients)
    }

    func validated() throws -> Self {
        try patch.validated()
        guard MealRevision.valid(expectedRevision), patch.hasChange || ingredients != nil,
            (ingredients?.count ?? 0) <= 200
        else { throw MealContractError.invalidPlacement }
        var ids = Set<UUID>()
        for ingredient in ingredients ?? [] {
            try ingredient.validated()
            if case .existing(let id, _) = ingredient, !ids.insert(id).inserted {
                throw MealContractError.invalidPlacement
            }
        }
        return self
    }
}

public struct RecipeEditReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let definitionId: UUID
    public let previousRevision: String
    public let revision: String

    func validated(member: VerifiedMember, command: EditRecipe) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, definitionId == command.definitionId,
            previousRevision == command.expectedRevision, MealRevision.valid(revision),
            let previous = Int64(previousRevision), let current = Int64(revision),
            current >= previous, current - previous <= 401
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct RecipeEditEnvelope: Decodable {
    let version: Int
    let receipt: RecipeEditReceipt
}
