import XCTest

@MainActor
final class TodayCardInsetTests: XCTestCase {
    func testMealCardUsesSharedInnerInsetAndOpensMeals() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_TODAY_CARD_INSET"] == "20261007-alex-read-only" else {
            throw XCTSkip("Requires owned Today shared-card inset check")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let link = app.buttons["Open meal plan"]
        try reader.reveal(link)
        try reader.requireTarget(link)
        XCTAssertEqual(link.frame.minX, 40, accuracy: 0.5)
        XCTAssertEqual(link.frame.maxX, app.frame.maxX - 40, accuracy: 0.5)
        reader.capture(link, name: "Today meal card shared20pt page and20pt inner insets")
        link.tap()
        XCTAssertTrue(app.staticTexts["tab-header-meals"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
