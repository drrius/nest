import Foundation

public struct GroceryMealSource: Codable, Equatable, Sendable {
    public let entryId: UUID
    public let title: String
    public let date: CivilDate?
    public let slot: String?
}

public struct GroceryItem: Codable, Equatable, Identifiable, Sendable {
    public let itemId: UUID
    public let name: String
    public let quantity: String?
    public let unit: String?
    public let categoryId: UUID?
    public let categoryName: String?
    public let version: String
    public let checked: Bool
    public let legacyClaimed: Bool
    public let offlineEpoch: UUID?
    public let mealSource: GroceryMealSource?

    public var id: UUID { itemId }

    public func validated() throws -> Self {
        let validVersion = !version.isEmpty && version.first != "0"
            && version.allSatisfy(\.isNumber) && Int64(version) != nil
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            name.count <= 120, (quantity?.count ?? 0) <= 80, (unit?.count ?? 0) <= 80,
            validVersion, categoryName == nil || categoryId != nil,
            mealSource == nil || !(mealSource?.title.isEmpty ?? true)
        else { throw GroceryContractError.invalidSnapshot }
        return self
    }
}

public struct GroceryList: Codable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let groceries: [GroceryItem]

    public func validated(household: UUID) throws -> Self {
        guard version == 1, householdId == household, groceries.count <= 1_000,
            Set(groceries.map(\.itemId)).count == groceries.count
        else { throw GroceryContractError.invalidSnapshot }
        for item in groceries { _ = try item.validated() }
        let epochs = Set(groceries.compactMap(\.offlineEpoch))
        guard epochs.count <= 1 else { throw GroceryContractError.invalidSnapshot }
        return self
    }
}

public enum GroceryContractError: Error { case invalidSnapshot, invalidReceipt }
