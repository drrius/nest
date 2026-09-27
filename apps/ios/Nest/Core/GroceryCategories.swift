import Foundation

public struct GroceryCategory: Codable, Equatable, Identifiable, Sendable {
    public let categoryId: UUID
    public let name: String
    public var id: UUID { categoryId }
}

public struct GroceryCategories: Decodable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let categories: [GroceryCategory]

    public func validated(household: UUID) throws -> Self {
        guard version == 1, householdId == household, categories.count <= 100,
            Set(categories.map(\.id)).count == categories.count,
            categories.allSatisfy({ !$0.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })
        else { throw GroceryContractError.invalidSnapshot }
        return self
    }
}
