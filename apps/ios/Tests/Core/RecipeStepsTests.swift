import XCTest

@testable import NestCore

final class RecipeStepsTests: XCTestCase {
    func testStepNumbersGoButQuantitiesStay() {
        let text = "1. Chop the onions\n2) Add 1.5 litres of stock\n\n2.5 hours in the oven\n3.Rest"
        XCTAssertEqual(
            RecipeSteps.split(text),
            ["Chop the onions", "Add 1.5 litres of stock", "2.5 hours in the oven", "3.Rest"])
        XCTAssertEqual(RecipeSteps.split(nil), [])
    }
}
