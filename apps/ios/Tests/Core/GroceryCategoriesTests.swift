import Foundation
import XCTest

@testable import NestCore

final class GroceryCategoriesTests: XCTestCase {
    private let household = UUID(uuidString: "22222222-2222-4222-8222-222222222222")!
    private let category = UUID(uuidString: "33333333-3333-4333-8333-333333333333")!

    func testRejectsAnotherHouseholdAndDuplicateCategories() throws {
        let foreign = try list(household: UUID(), ids: [category])
        XCTAssertThrowsError(try foreign.validated(household: household))
        let duplicate = try list(household: household, ids: [category, category])
        XCTAssertThrowsError(try duplicate.validated(household: household))
        let accepted = try list(household: household, ids: [category])
            .validated(household: household)
        XCTAssertEqual(accepted.categories.first?.name, "Produce")
    }

    private func list(household: UUID, ids: [UUID]) throws -> GroceryCategories {
        let rows = ids.map { "{\"categoryId\":\"\($0)\",\"name\":\"Produce\"}" }
            .joined(separator: ",")
        let body = """
            {"version":1,"householdId":"\(household)","categories":[\(rows)]}
            """
        return try JSONDecoder().decode(GroceryCategories.self, from: Data(body.utf8))
    }
}
