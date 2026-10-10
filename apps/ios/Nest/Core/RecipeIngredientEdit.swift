import Foundation

public struct RecipeIngredientPatch: Codable, Equatable, Sendable {
    public var name: String?
    public var quantity: String??
    public var unit: String??
    public var categoryId: UUID??
    public var note: String??

    enum CodingKeys: String, CodingKey { case name, quantity, unit, categoryId, note }

    public init(
        name: String? = nil, quantity: String?? = nil, unit: String?? = nil,
        categoryId: UUID?? = nil, note: String?? = nil
    ) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.categoryId = categoryId
        self.note = note
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        name = try values.decodeIfPresent(String.self, forKey: .name)
        quantity = values.contains(.quantity) ? .some(try values.decodeIfPresent(String.self, forKey: .quantity)) : nil
        unit = values.contains(.unit) ? .some(try values.decodeIfPresent(String.self, forKey: .unit)) : nil
        categoryId =
            values.contains(.categoryId) ? .some(try values.decodeIfPresent(UUID.self, forKey: .categoryId)) : nil
        note = values.contains(.note) ? .some(try values.decodeIfPresent(String.self, forKey: .note)) : nil
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encodeIfPresent(name, forKey: .name)
        if let quantity { try values.encode(quantity, forKey: .quantity) }
        if let unit { try values.encode(unit, forKey: .unit) }
        if let categoryId { try values.encode(categoryId, forKey: .categoryId) }
        if let note { try values.encode(note, forKey: .note) }
    }

    func validated() throws {
        guard name.map({ RecipeDraft.validText($0, maximum: 120) }) ?? true,
            quantity.flatMap({ $0 }).map({ RecipeDraft.validText($0, maximum: 80) }) ?? true,
            unit.flatMap({ $0 }).map({ RecipeDraft.validText($0, maximum: 80) }) ?? true,
            note.flatMap({ $0 }).map({ RecipeDraft.validText($0, maximum: 1000) }) ?? true
        else { throw MealContractError.invalidPlacement }
    }
}

public enum RecipeIngredientSelection: Codable, Equatable, Sendable {
    case existing(UUID, RecipeIngredientPatch)
    case new(RecipeIngredientDraft)

    enum CodingKeys: String, CodingKey { case kind, ingredientId, patch }
    enum Kind: String, Codable { case existing, new }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(Kind.self, forKey: .kind) {
        case .existing:
            self = .existing(
                try values.decode(UUID.self, forKey: .ingredientId),
                try values.decode(RecipeIngredientPatch.self, forKey: .patch))
        case .new: self = .new(try RecipeIngredientDraft(from: decoder))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .existing(let id, let patch):
            try values.encode(Kind.existing, forKey: .kind)
            try values.encode(id, forKey: .ingredientId)
            try values.encode(patch, forKey: .patch)
        case .new(let draft):
            try values.encode(Kind.new, forKey: .kind)
            try draft.encode(to: encoder)
        }
    }

    func validated() throws {
        switch self {
        case .existing(_, let patch): try patch.validated()
        case .new(let draft): try draft.validated()
        }
    }
}
