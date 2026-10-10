import Foundation

public struct EditGrocery: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let itemId: UUID
    public let expectedVersion: String
    public let name: String
    public let quantity: String?
    public let unit: String?
    public let categoryId: UUID?

    public init(
        item: GroceryItem, operationId: UUID, name: String,
        quantity: String?, unit: String?, categoryId: UUID?
    ) throws {
        let fields = try AddGrocery(
            operationId: operationId, itemId: item.id, name: name,
            quantity: quantity, unit: unit, categoryId: categoryId)
        self.operationId = fields.operationId
        itemId = fields.itemId
        expectedVersion = item.version
        self.name = fields.name
        self.quantity = fields.quantity
        self.unit = fields.unit
        self.categoryId = fields.categoryId
    }

    private enum CodingKeys: String, CodingKey {
        case operationId, itemId, expectedVersion, name, quantity, unit, categoryId
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(itemId, forKey: .itemId)
        try values.encode(expectedVersion, forKey: .expectedVersion)
        try values.encode(name, forKey: .name)
        try values.encode(quantity, forKey: .quantity)
        try values.encode(unit, forKey: .unit)
        try values.encode(categoryId, forKey: .categoryId)
    }

    func validated(against item: GroceryItem) throws -> Self {
        let expected = try EditGrocery(
            item: item, operationId: operationId, name: name,
            quantity: quantity, unit: unit, categoryId: categoryId)
        guard expected == self else { throw GroceryContractError.invalidSnapshot }
        return self
    }
}

public struct GroceryEditEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let receipt: GroceryWriteReceipt

    public func validated(household: UUID, item: GroceryItem, command: EditGrocery) throws
        -> GroceryWriteReceipt
    {
        guard version == 1, householdId == household,
            receipt.operation == command.operationId, receipt.target == item.id,
            receipt.checked == item.checked, !receipt.removed,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber),
            let confirmed = Int64(receipt.version), let previous = Int64(item.version),
            confirmed > previous
        else { throw GroceryContractError.invalidReceipt }
        return receipt
    }
}
