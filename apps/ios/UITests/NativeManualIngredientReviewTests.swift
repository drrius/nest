import XCTest

@MainActor
final class NativeManualIngredientReviewTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testSaveOwnedRiceChoiceWithoutAddingGroceries() throws {
        let week = try NativeOwnedMealWeek(action: "save_ingredients")
        XCTAssertEqual(week.fixture.name, "Test Alex")
        week.openIngredientReview()
        let lentils = week.app.buttons["QA lentils, 2026-10-19, Dinner"]
        let rice = week.app.buttons["QA rice, 2026-10-19, Dinner"]
        XCTAssertTrue(lentils.waitForExistence(timeout: 30))
        XCTAssertFalse(lentils.isSelected)
        week.reveal(rice)
        XCTAssertFalse(rice.isSelected)
        capture("Owned rice and pantry choices", app: week.app)
        rice.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "selected == true"), object: rice)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed)
        XCTAssertEqual(week.app.textFields["Quantity for QA rice, 2026-10-19, Dinner"].value as? String, "100")
        XCTAssertEqual(week.app.textFields["Unit for QA rice, 2026-10-19, Dinner"].value as? String, "g")
        let save = week.app.buttons["Save for later"]
        week.reveal(save)
        save.tap()
        XCTAssertTrue(
            week.app.staticTexts["Choices saved on this iPhone. No groceries were added."].waitForExistence(timeout: 15)
        )
        capture("Owned saved rice choice", app: week.app)
        week.finishIngredientReview()
    }

    func testConfirmOwnedRiceOnceAndExcludePantryLentils() throws {
        let week = try NativeOwnedMealWeek(action: "confirm_ingredients")
        XCTAssertEqual(week.fixture.name, "Test Alex")
        week.openIngredientReview()
        let lentils = week.app.buttons["QA lentils, 2026-10-19, Dinner"]
        let rice = week.app.buttons["QA rice, 2026-10-19, Dinner"]
        XCTAssertTrue(lentils.waitForExistence(timeout: 30))
        XCTAssertFalse(lentils.isSelected)
        week.reveal(rice)
        XCTAssertTrue(rice.isSelected, "The saved selection survives leaving and reopening")
        let add = week.app.buttons["Add 1 to Groceries"]
        week.reveal(add)
        XCTAssertTrue(add.isEnabled)
        add.tap()
        XCTAssertTrue(week.app.staticTexts["Add 1 ingredient to groceries?"].waitForExistence(timeout: 10))
        let confirm = week.app.buttons["Add to groceries"]
        XCTAssertTrue(confirm.isHittable)
        capture("Owned single-ingredient confirmation", app: week.app)
        confirm.tap()
        XCTAssertTrue(
            week.app.staticTexts["1 ingredient added. Anything already there wasn’t duplicated."].waitForExistence(
                timeout: 30))
        XCTAssertTrue(week.app.buttons["Open groceries"].exists)
        capture("Owned rice addition receipt", app: week.app)
        week.finishIngredientReview()
    }
    private func capture(_ name: String, app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
