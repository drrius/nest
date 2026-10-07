import XCTest

@MainActor
final class MoneyHistorySpacingTests: XCTestCase {
    func testRecentActivityRowsStayTogether() throws {
        let app = try openMoney()
        try requireContiguousRows(app)
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    func testFullHistoryRowsStayTogether() throws {
        let app = try openMoney()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self)
        let history = app.buttons["View full history"]
        try reader.reveal(history)
        try reader.requireTarget(history)
        history.tap()
        XCTAssertTrue(app.navigationBars["Financial history"].waitForExistence(timeout: 15))
        try requireContiguousRows(app)
        app.navigationBars["Financial history"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    private func openMoney() throws -> XCUIApplication {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_MONEY_HISTORY_SPACING"] == "20261007-alex-read-only" else {
                throw XCTSkip("Requires the prepared read-only Money history journey")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        #else
            throw XCTSkip("Fictional history checks are forbidden on physical phones")
        #endif
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        return app
    }

    private func requireContiguousRows(_ app: XCUIApplication) throws {
        let query = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH %@", "money-event-"))
        XCTAssertTrue(query.element(boundBy: 1).waitForExistence(timeout: 30))
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self)
        let rows = query.allElementsBoundByIndex.sorted { $0.frame.minY < $1.frame.minY }
        let first = try XCTUnwrap(rows.first)
        let second = try XCTUnwrap(rows.dropFirst().first)
        try reader.reveal(second)
        try reader.requireTarget(first)
        try reader.requireTarget(second)
        reader.capture(first, name: "Financial history adjacent rows")
        XCTAssertEqual(first.frame.minX, 20, accuracy: 0.5)
        XCTAssertEqual(second.frame.minX, first.frame.minX, accuracy: 0.5)
        XCTAssertEqual(second.frame.minY, first.frame.maxY, accuracy: 0.5)
    }
}
