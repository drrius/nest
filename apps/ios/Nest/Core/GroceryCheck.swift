import Foundation

public struct CheckGrocery: Codable, Equatable, Sendable {
    public let offlineEpoch: UUID?
    public let operationId: UUID
    public let itemId: UUID
    public let expectedVersion: String
    public let checked: Bool

    public init(item: GroceryItem, operationId: UUID, checked: Bool) {
        offlineEpoch = item.offlineEpoch
        self.operationId = operationId
        itemId = item.itemId
        expectedVersion = item.version
        self.checked = checked
    }
}

public struct GroceryCheckReceipt: Decodable, Equatable, Sendable {
    public enum Outcome: String, Decodable, Sendable {
        case applied
        case alreadyApplied = "already_applied"
    }
    public let operation: UUID
    public let target: UUID
    public let version: String
    public let checked: Bool
    public let outcome: Outcome
}

public struct GroceryCheckEnvelope: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let receipt: GroceryCheckReceipt

    public func validated(household: UUID, command: CheckGrocery) throws -> GroceryCheckReceipt {
        guard version == 1, householdId == household,
            receipt.operation == command.operationId,
            receipt.target == command.itemId, receipt.checked == command.checked,
            !receipt.version.isEmpty, receipt.version.first != "0",
            receipt.version.allSatisfy(\.isNumber), Int64(receipt.version) != nil
        else { throw GroceryContractError.invalidReceipt }
        return receipt
    }
}
