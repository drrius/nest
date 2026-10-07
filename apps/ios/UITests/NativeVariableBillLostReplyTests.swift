import XCTest

@MainActor
final class NativeVariableBillLostReplyTests: XCTestCase {
    private var cancellationVariant: Bool {
        ProcessInfo.processInfo.environment["NEST_QA_VARIABLE_REPLY_KIND"] == "cancellation"
    }
    private var title: String {
        cancellationVariant ? "Nest cancelled variable bill 20261007" : "Nest lost-reply variable bill 20261007"
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testRecordOneBillAndRetainUnconfirmedEntry() throws {
        let app = try open("record")
        try tap(app.buttons["Bills to confirm"], app: app)
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        try tap(row, app: app)
        try tap(app.buttons["Confirm bill or recover entry"], app: app)
        XCTAssertTrue(app.navigationBars["Confirm bill"].waitForExistence(timeout: 20))
        try enter("Amount (CHF)", value: "0.02", app: app)
        try enter("Your share (CHF)", value: "0.01", app: app)
        try enter("Partner’s share (CHF)", value: "0.01", app: app)
        try tap(app.buttons["Review bill"], app: app)
        try reader(app).read("Amount, CHF 0.02")
        try reader(app).read(title)
        try tap(app.buttons["Record bill"], app: app)
        let pending = app.staticTexts["Not confirmed yet. Resolve this saved entry before confirming another bill."]
        XCTAssertTrue(pending.waitForExistence(timeout: 25))
        try reader(app).reveal(pending)
        reader(app).capture(pending, name: "Unconfirmed bill after lost hosted reply")
        XCTAssertFalse(app.staticTexts["Bill recorded."].exists)
    }

    func testOfflineRestartDiscoversSavedBillFromMoneyRoot() throws {
        let app = try open("restart")
        try openSaved(app)
        XCTAssertTrue(
            app.staticTexts["Not confirmed yet. Resolve this saved entry before confirming another bill."]
                .waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Record bill"].exists)
        let retry = app.buttons[cancellationVariant ? "Retry cancellation" : "Check and retry"]
        try reader(app).reveal(retry)
        reader(app).capture(retry, name: "Saved bill discovered without live recurring-rule read")
    }

    func testRecoverOriginalBillReceiptAndFinishWithoutAnotherSave() throws {
        let app = try open("recover")
        try openSaved(app)
        try tap(app.buttons["Check and retry"], app: app)
        let recorded = app.staticTexts["Bill recorded."]
        XCTAssertTrue(recorded.waitForExistence(timeout: 20))
        try reader(app).reveal(recorded)
        reader(app).capture(recorded, name: "Recovered original recorded bill")
        try tap(app.buttons["View recorded expense"], app: app)
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 20))
        try tap(app.navigationBars.buttons.element(boundBy: 0), app: app, keyboard: true)
        try tap(app.buttons["Done"], app: app)
        XCTAssertTrue(app.staticTexts["No bill is due for confirmation on this rule."].waitForExistence(timeout: 20))
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testCancelPendingEntryRetainsUncertaintyAfterLostReply() throws {
        XCTAssertTrue(cancellationVariant)
        let app = try open("cancel_entry")
        try openSaved(app)
        try tap(app.buttons["Cancel pending entry"], app: app)
        let confirm = app.sheets.buttons["Cancel pending entry"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        try tap(confirm, app: app, keyboard: true)
        let retry = app.buttons["Retry cancellation"]
        XCTAssertTrue(retry.waitForExistence(timeout: 25))
        try reader(app).reveal(retry)
        reader(app).capture(retry, name: "Cancellation reply lost, exact request remains unresolved")
        XCTAssertFalse(app.staticTexts["Pending entry cancelled."].exists)
        XCTAssertFalse(app.buttons["Record bill"].exists)
    }

    func testRecoverCancellationAndContinueWithoutRecordingBill() throws {
        XCTAssertTrue(cancellationVariant)
        let app = try open("recover_cancel")
        try openSaved(app)
        try tap(app.buttons["Retry cancellation"], app: app)
        let cancelled = app.staticTexts["Pending entry cancelled."]
        XCTAssertTrue(cancelled.waitForExistence(timeout: 20))
        try reader(app).reveal(cancelled)
        reader(app).capture(cancelled, name: "Recovered cancelled entry without an expense")
        XCTAssertFalse(app.buttons["View recorded expense"].exists)
        try tap(app.buttons["Continue"], app: app)
        XCTAssertTrue(app.staticTexts[title].waitForExistence(timeout: 20))
        XCTAssertFalse(cancelled.exists)
        XCTAssertTrue(app.buttons["Review bill"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func openSaved(_ app: XCUIApplication) throws {
        try tap(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Saved changes")).firstMatch, app: app)
        let link = app.buttons["Bill confirmation"]
        XCTAssertTrue(link.waitForExistence(timeout: 15))
        try tap(link, app: app)
        XCTAssertTrue(app.navigationBars["Confirm bill"].waitForExistence(timeout: 15))
    }

    private func reader(_ app: XCUIApplication) -> AssistantFinancialHistoryMaximumReading {
        AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
    }

    private func tap(_ target: XCUIElement, app: XCUIApplication, keyboard: Bool = false) throws {
        if !keyboard { try reader(app).reveal(target) }
        XCTAssertTrue(target.waitForExistence(timeout: 15))
        try reader(app).requireTarget(target, bounds: keyboard ? app.frame : nil)
        target.tap()
    }

    private func enter(_ label: String, value: String, app: XCUIApplication) throws {
        let field = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label == %@ AND (elementType == %d OR elementType == %d)", label,
                XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue)
        ).firstMatch
        try reader(app).reveal(field)
        field.tap()
        field.typeText(value)
        XCTAssertEqual(field.value as? String, value)
        try tap(app.buttons["Done"], app: app, keyboard: true)
    }

    private func open(_ action: String) throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_VARIABLE_LOST_REPLY"] == "20261007", env["NEST_QA_ACTION"] == action else {
            throw XCTSkip("Requires the exact owned variable-bill UI action")
        }
        #if targetEnvironment(simulator)
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        #else
            throw XCTSkip("Fictional financial UI fixtures are forbidden on phones")
        #endif
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], ["record", "cancel_entry"].contains(action) ? "1" : "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://localhost:4667")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        return app
    }
}
