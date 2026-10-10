import XCTest

@MainActor
final class MealCardInsetTests: XCTestCase {
    func testLargestTextEmptySlotKeepsSharedInsetAndNativeCancel() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_MEAL_CARD_INSET"] == "20261007-alex-read-only" else {
            throw XCTSkip("Requires owned empty-week largest-text layout check")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Meals"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let slots = app.buttons.matching(NSPredicate(format: "label ENDSWITH %@", ", Dinner: Add meal"))
        let slot = slots.firstMatch
        XCTAssertTrue(slot.waitForExistence(timeout: 25))
        try reader.reveal(slot)
        try reader.requireTarget(slot)
        XCTAssertEqual(slot.frame.minX, 40, accuracy: 0.5)
        XCTAssertEqual(slot.frame.maxX, app.frame.maxX - 40, accuracy: 0.5)
        reader.capture(slot, name: "Largest text meal slot shared card insets")
        slot.tap()
        XCTAssertTrue(app.navigationBars["Add meal"].waitForExistence(timeout: 15))
        let cancel = app.navigationBars["Add meal"].buttons["Cancel"]
        try reader.requireTarget(cancel, bounds: app.frame)
        cancel.tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        XCTAssertFalse(app.navigationBars["Add meal"].exists)
        XCTAssertTrue(slot.exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
