import XCTest

@MainActor
final class NativeExpenseOutageTests: XCTestCase {
    func testOwnedAPIOutageKeepsExpenseDraftAndAllowsOnlineReload() async throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        try tap("Add expense", app: app, reader: reader)
        let description = app.textFields["Description"]
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        description.tap()
        description.typeText("Unsent API outage fixture 20261007")
        let amount = app.textFields["Shared amount (CHF)"]
        amount.tap()
        amount.typeText("1.01")
        let review = app.buttons["expense.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("CHF 1.01")
        try await setMode("offline")
        try tap("Save expense", app: app, reader: reader)
        let message = app.staticTexts[
            "Could not start this save. Connect and reload the people before reviewing again. Your draft is kept."]
        XCTAssertTrue(message.waitForExistence(timeout: 20))
        reader.capture(message, name: "API outage refuses new financial intent and retains reviewed draft")
        XCTAssertFalse(app.staticTexts["Expense recorded."].exists)
        try await setMode("online")
        try tap("Reload people and edit", app: app, reader: reader)
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        XCTAssertEqual(description.value as? String, "Unsent API outage fixture 20261007")
        XCTAssertEqual(amount.value as? String, "1.01")
        reader.capture(description, name: "Online reload retains unsent description and amount")
        let back = app.navigationBars["Add expense"].buttons["Back"]
        try reader.requireTarget(back, bounds: app.frame)
        back.tap()
        let discard = app.alerts["Discard edits?"].buttons["Discard edits"]
        XCTAssertTrue(discard.waitForExistence(timeout: 10))
        try reader.requireTarget(discard, bounds: app.frame)
        discard.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func tap(_ title: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        let button = app.buttons[title]
        try reader.reveal(button)
        try reader.requireTarget(button)
        button.tap()
    }

    private func setMode(_ mode: String) async throws {
        let token = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_OUTAGE_CONTROL"])
        let url = try XCTUnwrap(URL(string: "https://localhost:18446/_qa/mode/\(mode)"))
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue(token, forHTTPHeaderField: "X-Nest-QA-Control")
        let (_, response) = try await URLSession.shared.data(for: request)
        XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_API_OUTAGE"] == "20261007-read-only-clone" else {
            throw XCTSkip("Requires an isolated authenticated fixture clone and read-only outage relay")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_OUTAGE_CLONE"])
        XCTAssertEqual(env["SIMULATOR_UDID"], clone)
        XCTAssertFalse(
            ["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone))
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://localhost:18446")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
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
}
