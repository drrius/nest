import XCTest

@MainActor
final class TodayQuickAddReadingTests: XCTestCase {
    func testFilledAddActionIsReadableAndOpensItsMenu() throws {
        _ = try NativeMealWeekFixture(action: "quick_add_reading")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        let add = app.buttons["Add to your household"]
        XCTAssertTrue(add.waitForExistence(timeout: 15))
        XCTAssertTrue(add.isHittable)
        XCTAssertGreaterThanOrEqual(add.frame.height + 0.000_001, 44)
        XCTAssertLessThan(add.frame.maxY, app.tabBars.firstMatch.frame.minY)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Today filled Add action"
        screenshot.lifetime = .keepAlways
        self.add(screenshot)
        add.tap()
        for label in ["Chore", "Grocery", "Expense"] {
            XCTAssertTrue(app.buttons[label].waitForExistence(timeout: 10))
        }
        app.tap()
        XCTAssertTrue(add.waitForExistence(timeout: 10))
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
