import Foundation

public struct AddGrocery: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let itemId: UUID
    public let name: String
    public let quantity: String?
    public let unit: String?
    public let categoryId: UUID?

    public init(
        operationId: UUID, itemId: UUID, name: String,
        quantity: String?, unit: String?, categoryId: UUID?
    ) throws {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, name.count <= 120,
            (quantity?.count ?? 0) <= 80, (unit?.count ?? 0) <= 80
        else { throw GroceryContractError.invalidSnapshot }
        self.operationId = operationId
        self.itemId = itemId
        self.name = trimmed
        self.quantity = quantity?.nilIfBlank
        self.unit = unit?.nilIfBlank
        self.categoryId = categoryId
    }

    private enum CodingKeys: String, CodingKey {
        case operationId, itemId, name, quantity, unit, categoryId
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(itemId, forKey: .itemId)
        try values.encode(name, forKey: .name)
        try values.encode(quantity, forKey: .quantity)
        try values.encode(unit, forKey: .unit)
        try values.encode(categoryId, forKey: .categoryId)
    }

    func validated() throws -> Self {
        let expected = try AddGrocery(
            operationId: operationId, itemId: itemId, name: name,
            quantity: quantity, unit: unit, categoryId: categoryId)
        guard expected == self else { throw GroceryContractError.invalidSnapshot }
        return self
    }
}

public struct GroceryWriteReceipt: Decodable, Equatable, Sendable {
    public let operation: UUID
    public let target: UUID
    public let version: String
    public let checked: Bool
    public let removed: Bool
}

public struct GroceryAddEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let receipt: GroceryWriteReceipt

    public func validated(household: UUID, command: AddGrocery) throws -> GroceryWriteReceipt {
        guard version == 1, householdId == household,
            receipt.operation == command.operationId, receipt.target == command.itemId,
            !receipt.checked, !receipt.removed, !receipt.version.isEmpty,
            receipt.version.first != "0", receipt.version.allSatisfy(\.isNumber),
            Int64(receipt.version) != nil
        else { throw GroceryContractError.invalidReceipt }
        return receipt
    }
}

extension String {
    fileprivate var nilIfBlank: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
