import Foundation
import Testing

@testable import NestCore

struct GroceryContractsTests {
    private let household = UUID(uuidString: "11111111-1111-4111-8111-111111111111")!
    private let item = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let epoch = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    @Test func acceptsCurrentSnapshotAndCapturesImmutableCheckIdentity() throws {
        let list = try decodeList(version: "42")
        let saved = try list.validated(household: household)
        let command = CheckGrocery(item: saved.groceries[0], operationId: UUID(), checked: true)
        #expect(command.itemId == item)
        #expect(command.expectedVersion == "42")
        #expect(command.offlineEpoch == epoch)
        #expect(command.checked)
    }

    @Test func refusesAnotherHouseholdBeforeDisplayingItems() throws {
        let list = try decodeList(version: "42")
        #expect(throws: GroceryContractError.self) {
            try list.validated(household: UUID())
        }
    }

    @Test func refusesVersionOverflowAndMixedEpochs() throws {
        #expect(throws: GroceryContractError.self) {
            try decodeList(version: "9223372036854775808").validated(household: household)
        }
        let first = try decodeList(version: "42").groceries[0]
        let encoded = String(decoding: try JSONEncoder().encode(first), as: UTF8.self)
        let other =
            encoded
            .replacingOccurrences(of: item.uuidString, with: UUID().uuidString)
            .replacingOccurrences(of: epoch.uuidString, with: UUID().uuidString)
        let second = try JSONDecoder().decode(GroceryItem.self, from: Data(other.utf8))
        let mixed = GroceryList(version: 1, householdId: household, groceries: [first, second])
        #expect(throws: GroceryContractError.self) { try mixed.validated(household: household) }
    }

    @Test func refusesReceiptForAnotherOperation() throws {
        let command = CheckGrocery(item: try decodeList(version: "42").groceries[0], operationId: UUID(), checked: true)
        let data = Data(
            """
            {"version":1,"householdId":"\(household)","receipt":{"operation":"\(UUID())","target":"\(item)","version":"43","checked":true,"outcome":"applied"}}
            """.utf8)
        let envelope = try JSONDecoder().decode(GroceryCheckEnvelope.self, from: data)
        #expect(throws: GroceryContractError.self) {
            try envelope.validated(household: household, command: command)
        }
    }

    private func decodeList(version: String) throws -> GroceryList {
        let data = Data(
            """
            {"version":1,"householdId":"\(household)","groceries":[{"itemId":"\(item)","name":"Oat milk","quantity":"2","unit":"cartons","categoryId":null,"categoryName":null,"version":"\(version)","checked":false,"legacyClaimed":false,"offlineEpoch":"\(epoch)","mealSource":null}]}
            """.utf8)
        return try JSONDecoder().decode(GroceryList.self, from: data)
    }
}
