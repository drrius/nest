import XCTest

@MainActor
final class NativeSettlementPostingTests: XCTestCase {
    func testOwnedSettlementAndExpenseRestoreFixtureBalance() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let payment = app.buttons["Record a payment"]
        try reader.reveal(payment)
        try reader.requireTarget(payment)
        payment.tap()
        XCTAssertTrue(app.navigationBars["Record payment"].waitForExistence(timeout: 20))
        try reader.read("CHF 0.01")
        let note = app.textFields["Note (optional)"]
        try reader.reveal(note)
        note.tap()
        note.typeText("Nest QA settlement roundtrip 20261007")
        try tap("Done", app: app, reader: reader, keyboard: true)
        try tap("Review payment", app: app, reader: reader)
        try reader.read("Amount, CHF 0.01")
        try reader.read("Paid by, Test Sam")
        try reader.read("Paid to, You")
        try tap("Record payment", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Payment recorded."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Payment recorded."], name: "Canonical fixture settlement recorded")
        try tap("Done", app: app, reader: reader)
        XCTAssertTrue(
            app.staticTexts["You’re settled up. There is no outstanding balance to record a payment against."]
                .waitForExistence(timeout: 30))
        app.navigationBars["Record payment"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        try recordBalancingExpense(app, reader: reader)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func recordBalancingExpense(
        _ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading
    ) throws {
        try tap("Add expense", app: app, reader: reader)
        let description = app.textFields["Description"]
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        description.tap()
        description.typeText("Nest QA settlement balance restore 20261007")
        let amount = app.textFields["Shared amount (CHF)"]
        amount.tap()
        amount.typeText("0.02")
        let review = app.buttons["expense.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("CHF 0.02")
        try tap("Save expense", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Expense recorded."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Expense recorded."], name: "Canonical balancing fixture expense recorded")
        try tap("Start another expense", app: app, reader: reader)
        XCTAssertTrue(description.waitForExistence(timeout: 30))
        XCTAssertTrue(["", "Description"].contains(description.value as? String ?? "unexpected value"))
        app.navigationBars["Add expense"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
    }

    private func tap(
        _ label: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading, keyboard: Bool = false
    ) throws {
        let target = app.buttons[label]
        if !keyboard { try reader.reveal(target) }
        try reader.requireTarget(target, bounds: keyboard ? app.frame : nil)
        target.tap()
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SETTLEMENT_ROUNDTRIP"] == "20261007-two-fixture-writes" else {
            throw XCTSkip("Requires explicit fictional settlement/expense budget and retained-history baseline")
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
