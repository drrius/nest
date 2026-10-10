import Foundation

public struct RemoveGrocery: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let itemId: UUID
    public let expectedVersion: String

    public init(item: GroceryItem, operationId: UUID) {
        self.operationId = operationId
        itemId = item.id
        expectedVersion = item.version
    }

    func validated(against item: GroceryItem) throws -> Self {
        guard self == RemoveGrocery(item: item, operationId: operationId) else {
            throw GroceryContractError.invalidSnapshot
        }
        return self
    }
}

public struct GroceryRemoveEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let receipt: GroceryWriteReceipt

    public func validated(household: UUID, item: GroceryItem, command: RemoveGrocery) throws
        -> GroceryWriteReceipt
    {
        guard version == 1, householdId == household,
            receipt.operation == command.operationId, receipt.target == item.id,
            receipt.checked == item.checked, receipt.removed,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber),
            let confirmed = Int64(receipt.version), let previous = Int64(item.version),
            confirmed > previous
        else { throw GroceryContractError.invalidReceipt }
        return receipt
    }
}
