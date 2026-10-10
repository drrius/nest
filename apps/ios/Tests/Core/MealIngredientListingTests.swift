import Foundation
import XCTest

@testable import NestCore

final class MealIngredientListingTests: XCTestCase {
    private let household = UUID()
    private let entry = UUID()
    private let grocery = UUID()
    private var week: MealWeekStart { try! MealWeekStart("2035-06-04") }

    func testLoadsAllPagesAndRejectsCrossPageInconsistency() throws {
        let first = try initial()
        XCTAssertFalse(first.complete)
        let finished = try first.appending(page([row(101)]))
        XCTAssertTrue(finished.complete)
        XCTAssertEqual(finished.ingredients.count, 101)
        XCTAssertThrowsError(try finished.appending(page([])))
        XCTAssertThrowsError(try first.appending(page([row(100)])))
        XCTAssertThrowsError(try first.appending(page([row(101, title: "Different")])))
        XCTAssertThrowsError(try first.appending(page([row(101, item: grocery)])))
        let skipped = SkippedMealIngredients(entryId: UUID(), reason: .noRecipe)
        XCTAssertThrowsError(try first.appending(page([row(101)], skipped: [skipped])))
        XCTAssertEqual(first.ingredients.count, 100)
    }

    private func initial() throws -> MealIngredientListing {
        let rows = (1...100).map { row($0, item: $0 == 1 ? grocery : nil) }
        return try MealIngredientListing(week: week, revision: "1", household: household)
            .appending(page(rows, next: rows.last!.id))
    }

    private func row(_ index: Int, title: String = "Soup", item: UUID? = nil) -> MealIngredient {
        let id = UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", index))!
        return MealIngredient(
            entryId: entry, ingredientId: id, quantity: "1", unit: "cup",
            mealTitle: title, date: week.date, slot: .dinner, name: "Ingredient \(index)", categoryId: nil,
            groceryItemId: item)
    }

    private func page(
        _ rows: [MealIngredient], next: MealIngredientSource? = nil, skipped: [SkippedMealIngredients] = []
    ) -> MealIngredientPage {
        MealIngredientPage(
            version: 1, householdId: household, weekStart: week, revision: "1",
            ingredients: rows, skipped: skipped, nextAfter: next)
    }
}
