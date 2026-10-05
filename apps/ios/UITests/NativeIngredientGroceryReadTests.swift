import XCTest

@MainActor
final class NativeIngredientGroceryReadTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testReadConfirmedRiceWithoutCheckingOrEditing() throws {
        let fixture = try NativeMealWeekFixture(action: "read_grocery")
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        let groceries = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Groceries")).firstMatch
        reveal(groceries, in: app)
        XCTAssertTrue(groceries.isHittable)
        groceries.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        let rice = app.buttons["QA rice"]
        reveal(rice, in: app)
        XCTAssertTrue(rice.isHittable)
        XCTAssertEqual(rice.value as? String, "To pick up")
        XCTAssertGreaterThanOrEqual(rice.frame.height, 56)
        XCTAssertTrue(app.staticTexts["100 g"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "\(fixture.name) reads confirmed100g rice"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.navigationBars["Groceries"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<35 {
            let bottom = app.tabBars.firstMatch.frame.minY
            if element.isHittable && element.frame.minY >= 80 && element.frame.maxY <= bottom { return }
            let frame = element.exists ? element.frame : .zero
            if frame.height > 0 && frame.minY < 80 {
                app.swipeDown(velocity: .slow)
            } else {
                app.swipeUp(velocity: .slow)
            }
        }
        XCTFail("The owned native grocery control is not fully visible")
    }
}
