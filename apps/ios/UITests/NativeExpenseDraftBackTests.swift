import XCTest

@MainActor
final class NativeExpenseDraftBackTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedUnsentExpenseBackKeepAndDiscard() throws {
        let app = try openExpense()
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let description = input("Description", app: app)
        try reading.reveal(description)
        description.tap()
        description.typeText("Unsent expense draft QA")
        try protectedBack(app, reading: reading, keep: true)
        XCTAssertEqual(description.value as? String, "Unsent expense draft QA")
        try protectedBack(app, reading: reading, keep: false)
        XCTAssertTrue(app.buttons["tab-header-money"].exists || app.staticTexts["tab-header-money"].exists)
        try openForm(app)
        let blank = input("Description", app: app)
        try reading.reveal(blank)
        XCTAssertTrue(blank.value as? String == "Description" || blank.value as? String == "")
        app.navigationBars["Add expense"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    func testOwnedReviewedExpenseBackKeepAndDiscardWithoutSaving() throws {
        let app = try openExpense()
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let description = input("Description", app: app)
        try reading.reveal(description)
        description.tap()
        description.typeText("Unsent reviewed expense QA")
        let amount = input("Shared amount (CHF)", app: app)
        try reading.reveal(amount)
        amount.tap()
        amount.typeText("0.03")
        let review = app.buttons["expense.keyboard-review"]
        try reading.requireTarget(review, bounds: app.frame)
        review.tap()
        let save = app.buttons["Save expense"]
        try reading.reveal(save)
        XCTAssertTrue(save.waitForExistence(timeout: 15))
        try protectedBack(app, reading: reading, keep: true)
        XCTAssertTrue(save.exists)
        try reading.read("Unsent reviewed expense QA")
        try protectedBack(app, reading: reading, keep: false)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func protectedBack(
        _ app: XCUIApplication, reading: AssistantFinancialHistoryMaximumReading, keep: Bool
    ) throws {
        let back = app.navigationBars["Add expense"].buttons["Back"]
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let choice = alert.buttons[keep ? "Keep editing" : "Discard edits"]
        try reading.requireTarget(choice, bounds: app.frame)
        reading.capture(choice, name: "Owned expense unsent back choice before selection")
        choice.tap()
    }

    private func input(_ label: String, app: XCUIApplication) -> XCUIElement {
        let multiline = app.textViews[label]
        return multiline.exists ? multiline : app.textFields[label]
    }

    private func openExpense() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_DRAFT_BACK"] == "20261007-no-save" else {
            throw XCTSkip("Explicit fictional expense draft navigation; no financial save permitted")
        }
        XCTAssertTrue(
            [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783",
            ].contains(try XCTUnwrap(env["SIMULATOR_UDID"])))
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        try openForm(app)
        return app
    }

    private func openForm(_ app: XCUIApplication) throws {
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let add = app.buttons["Add expense"]
        try reading.reveal(add)
        try reading.requireTarget(add)
        add.tap()
        XCTAssertTrue(app.navigationBars["Add expense"].waitForExistence(timeout: 15))
        XCTAssertTrue(input("Description", app: app).waitForExistence(timeout: 30))
    }
}
