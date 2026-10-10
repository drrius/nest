import XCTest

@MainActor
final class NativePaymentResultFeedbackTests: XCTestCase {
    func testOwnedExpenseAndPartialSettlementShowCanonicalResultsFirst() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        try recordExpense(app, reader: reader)
        try tap("Record a payment", app: app, reader: reader)
        XCTAssertTrue(app.navigationBars["Record payment"].waitForExistence(timeout: 20))
        try reader.read("CHF 0.02")
        try tap("Partial amount", app: app, reader: reader)
        let amount = app.textFields["Amount (CHF)"]
        try reader.reveal(amount)
        amount.tap()
        amount.typeText("0.01")
        try tap("Done", app: app, reader: reader, keyboard: true)
        try tap("Review payment", app: app, reader: reader)
        try reader.read("Amount, CHF 0.01")
        try tap("Record payment", app: app, reader: reader)
        try requireVisibleResult("Payment recorded.", app: app, reader: reader)
        try tap("Done", app: app, reader: reader)
        try reader.read("CHF 0.01")
        app.navigationBars["Record payment"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func recordExpense(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Add expense", app: app, reader: reader)
        let description = app.textFields["Description"]
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        description.tap()
        description.typeText("Nest QA visible result expense 20261007")
        let amount = app.textFields["Shared amount (CHF)"]
        amount.tap()
        amount.typeText("0.02")
        let review = app.buttons["expense.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("CHF 0.02")
        try tap("Save expense", app: app, reader: reader)
        try requireVisibleResult("Expense recorded.", app: app, reader: reader)
        try tap("Start another expense", app: app, reader: reader)
        XCTAssertTrue(description.waitForExistence(timeout: 30))
        XCTAssertTrue(["", "Description"].contains(description.value as? String ?? "unexpected value"))
        app.navigationBars["Add expense"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
    }

    private func requireVisibleResult(
        _ label: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading
    ) throws {
        let result = app.staticTexts[label]
        XCTAssertTrue(result.waitForExistence(timeout: 30))
        reader.capture(result, name: "Canonical \(label) visible without scrolling")
        XCTAssertTrue(try reader.viewport().contains(result.frame), "Result must be visible before any scroll")
    }

    private func tap(
        _ label: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading, keyboard: Bool = false
    ) throws {
        let button = app.buttons[label]
        if !keyboard { try reader.reveal(button) }
        try reader.requireTarget(button, bounds: keyboard ? app.frame : nil)
        button.tap()
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_PARTIAL_RESULT_POSTING"] == "20261007-two-fixture-writes-after64" else {
            throw XCTSkip("Requires a distinct two-operation fixture budget after the recorded 64-event baseline")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "2")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
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
