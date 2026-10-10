import XCTest

@MainActor
final class NativeSettlementCancellationTests: XCTestCase {
    func testRefusedPostingSurvivesRestartAndExplicitCancellation() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        try tap("Record a payment", app: app, reader: reader)
        try reader.read("Test Sam pays you, CHF 0.01")
        try tap("Review payment", app: app, reader: reader)
        try reader.read("Amount, CHF 0.01")
        try tap("Record payment", app: app, reader: reader)
        let pending = app.staticTexts["Not confirmed yet. Resolve this request before recording another payment."]
        XCTAssertTrue(pending.waitForExistence(timeout: 25))
        reader.capture(pending, name: "Refused posting retains exact pending payment")
        XCTAssertFalse(app.staticTexts["Payment recorded."].exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        if !app.navigationBars["Record payment"].exists {
            try tap("Record a payment", app: app, reader: reader)
        }
        XCTAssertTrue(pending.waitForExistence(timeout: 20))
        reader.capture(pending, name: "Restart preserves unresolved payment and recovery actions")
        try reader.read("Amount, CHF 0.01")
        try tap("Cancel pending record", app: app, reader: reader)
        let cancel = app.sheets.buttons["Cancel pending record"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        try reader.requireTarget(cancel, bounds: app.frame)
        cancel.tap()
        let cancelled = app.staticTexts["This request was cancelled without recording a payment."]
        XCTAssertTrue(cancelled.waitForExistence(timeout: 25))
        reader.capture(cancelled, name: "Explicit cancellation confirms no payment recorded")
        try tap("Start again with current balance", app: app, reader: reader)
        try reader.read("Test Sam pays you, CHF 0.01")
        app.navigationBars["Record payment"].buttons.element(boundBy: 0).tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testRecoverRetainedRequestByExplicitCancellationWithoutSaving() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        try tap("Record a payment", app: app, reader: reader)
        let pending = app.staticTexts["Not confirmed yet. Resolve this request before recording another payment."]
        XCTAssertTrue(pending.waitForExistence(timeout: 20))
        reader.capture(pending, name: "Retained exact unresolved payment before recovery-only cancellation")
        try reader.read("Amount, CHF 0.01")
        try tap("Cancel pending record", app: app, reader: reader)
        let cancel = app.sheets.buttons["Cancel pending record"].firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 10))
        try reader.requireTarget(cancel, bounds: app.frame)
        cancel.tap()
        let cancelled = app.staticTexts["This request was cancelled without recording a payment."]
        XCTAssertTrue(cancelled.waitForExistence(timeout: 25))
        reader.capture(cancelled, name: "Recovery-only cancellation confirms no payment recorded")
        try tap("Start again with current balance", app: app, reader: reader)
        try reader.read("Test Sam pays you, CHF 0.01")
        app.navigationBars["Record payment"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func tap(_ label: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        let target = app.buttons[label]
        try reader.reveal(target)
        try reader.requireTarget(target)
        target.tap()
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SETTLEMENT_CANCEL"] == "20261007-refuse-save-one-cancel" else {
            throw XCTSkip("Requires a guarded authenticated clone; every Save is refused before upstream")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_SETTLEMENT_CLONE"])
        XCTAssertEqual(env["SIMULATOR_UDID"], clone)
        XCTAssertFalse(
            ["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone))
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_CANCEL_BUDGET"], "1")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://localhost:18447")
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
