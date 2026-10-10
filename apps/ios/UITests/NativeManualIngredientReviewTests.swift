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
        let lentils = week.app.switches["QA lentils, 2026-10-19, Dinner"]
        let rice = week.app.switches["QA rice, 2026-10-19, Dinner"]
        XCTAssertTrue(lentils.waitForExistence(timeout: 30))
        XCTAssertEqual(lentils.value as? String, "0")
        week.reveal(rice)
        XCTAssertEqual(rice.value as? String, "0")
        XCTAssertEqual(
            week.app.textFields["Quantity, Quantity for QA rice, 2026-10-19, Dinner"].value as? String, "100")
        XCTAssertEqual(week.app.textFields["Unit, Unit for QA rice, 2026-10-19, Dinner"].value as? String, "g")
        capture("Owned rice and pantry choices", app: week.app)
        rice.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)).tap()
        let selected = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "1"), object: rice)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 5), .completed)
        let save = week.app.buttons["Save choices for later"]
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
        let lentils = week.app.switches["QA lentils, 2026-10-19, Dinner"]
        let rice = week.app.switches["QA rice, 2026-10-19, Dinner"]
        XCTAssertTrue(lentils.waitForExistence(timeout: 30))
        XCTAssertEqual(lentils.value as? String, "0")
        week.reveal(rice)
        XCTAssertEqual(rice.value as? String, "1", "The saved selection survives leaving and reopening")
        let add = week.app.buttons["Add 1 to groceries"]
        week.reveal(add)
        XCTAssertTrue(add.isEnabled)
        add.tap()
        XCTAssertTrue(week.app.staticTexts["Add 1 ingredient to groceries?"].waitForExistence(timeout: 10))
        let confirm = week.app.buttons["Add to groceries"]
        XCTAssertTrue(confirm.isHittable)
        capture("Owned single-ingredient confirmation", app: week.app)
        confirm.tap()
        XCTAssertTrue(
            week.app.staticTexts["1 ingredient confirmed. Items already added were not duplicated."].waitForExistence(
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
