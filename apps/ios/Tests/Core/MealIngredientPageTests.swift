import Foundation
import XCTest

@testable import NestCore

final class MealIngredientPageTests: XCTestCase {
    private let household = UUID()
    private let entry = UUID()
    private let ingredient = UUID()

    func testWireNullAndPreservedQuantity() throws {
        let week = try MealWeekStart("2035-06-04")
        let encoded = try JSONEncoder().encode(ReadMealIngredients(weekStart: week, expectedRevision: "2", after: nil))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertTrue(json["after"] is NSNull)
        let page = try decode()
        _ = try page.validated(household: household, week: week, revision: "2", after: nil)
        XCTAssertEqual(page.ingredients.first?.quantity, "1/2")
        XCTAssertEqual(page.ingredients.first?.unit, "cup")
        XCTAssertThrowsError(try page.validated(household: UUID(), week: week, revision: "2", after: nil))
        XCTAssertThrowsError(try page.validated(household: household, week: week, revision: "3", after: nil))
        XCTAssertThrowsError(
            try page.validated(household: household, week: week, revision: "2", after: page.ingredients[0].id))
    }

    func testRejectsIncoherentOrOutOfWeekRows() throws {
        let week = try MealWeekStart("2035-06-04")
        for variant in ["duplicate", "outside", "skipped", "cursor", "details", "grocery"] {
            let page = try decode(variant)
            XCTAssertThrowsError(
                try page.validated(household: household, week: week, revision: "2", after: nil), variant)
        }
    }

    private func decode(_ variant: String = "valid") throws -> MealIngredientPage {
        var row: [String: Any] = [
            "entryId": entry.uuidString, "ingredientId": ingredient.uuidString,
            "quantity": "1/2", "unit": "cup", "mealTitle": "Soup", "date": "2035-06-04",
            "slot": "dinner", "name": "Lentils", "categoryId": NSNull(), "groceryItemId": NSNull(),
        ]
        if variant == "outside" { row["date"] = "2035-06-11" }
        if variant == "grocery" { row["groceryItemId"] = UUID().uuidString }
        var rows = [row]
        if variant == "duplicate" { rows.append(row) }
        if variant == "details" || variant == "grocery" {
            var second = row
            second["ingredientId"] = "ffffffff-ffff-ffff-ffff-ffffffffffff"
            if variant == "details" { second["mealTitle"] = "Different" }
            rows.append(second)
        }
        let source: [String: Any] = ["entryId": entry.uuidString, "ingredientId": ingredient.uuidString]
        let page: [String: Any] = [
            "version": 1, "householdId": household.uuidString, "weekStart": "2035-06-04", "revision": "2",
            "ingredients": rows,
            "skipped": variant == "skipped" ? [["entryId": entry.uuidString, "reason": "leftovers"]] : [],
            "nextAfter": variant == "cursor" ? source : NSNull(),
        ]
        return try JSONDecoder().decode(MealIngredientPage.self, from: JSONSerialization.data(withJSONObject: page))
    }
}
