import XCTest

@MainActor
final class GrocerySpokenDetailTests: XCTestCase {
    func testExistingQuantityIsIncludedInAccessibleValueWithoutCheckingItem() throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_GROCERY_SPOKEN_DETAIL"] == "20261007-read-only" else {
            throw XCTSkip("Requires the retained100g QA rice fixture; reads only")
        }
        continueAfterFailure = false
        XCTAssertEqual(ProcessInfo.processInfo.environment["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let groceries = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Groceries")).firstMatch
        try reader.reveal(groceries)
        try reader.requireTarget(groceries)
        groceries.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        let rice = app.buttons["QA rice"]
        XCTAssertTrue(rice.waitForExistence(timeout: 15))
        try reader.reveal(rice)
        try reader.requireTarget(rice)
        XCTAssertEqual(rice.label, "QA rice")
        XCTAssertEqual(rice.value as? String, "100 g, To pick up")
        reader.capture(rice, name: "Grocery quantity and pickup state in actual accessibility value")
        app.navigationBars["Groceries"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
