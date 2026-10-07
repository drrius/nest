import XCTest

@MainActor
final class NativeMoneyDraftBackTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedPaymentNoteKeepDiscardAndPristineBack() throws {
        let app = try openMoney()
        try openLink("Record a payment", title: "Record payment", app: app)
        try editAndDiscardNote(app, title: "Record payment")
        try openLink("Record a payment", title: "Record payment", app: app)
        try pristineBack(app, title: "Record payment")
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    func testOwnedRefundNoteKeepDiscardAndPristineBack() throws {
        let app = try openMoney()
        try openSource(app)
        try openLink("Record refund", title: "Record refund", app: app)
        try editAndDiscardNote(app, title: "Record refund")
        try openLink("Record refund", title: "Record refund", app: app)
        try pristineBack(app, title: "Record refund")
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    func testOwnedCorrectionPristineAndReviewedBackWithoutConfirming() throws {
        let app = try openMoney()
        try openSource(app)
        try openLink("Correct entry", title: "Correct entry", app: app)
        let review = app.buttons["Review correction"]
        try reader(app).reveal(review)
        XCTAssertTrue(review.waitForExistence(timeout: 30))
        try pristineBack(app, title: "Correct entry")
        try openLink("Correct entry", title: "Correct entry", app: app)
        let reading = reader(app)
        try reading.reveal(review)
        try reading.requireTarget(review)
        review.tap()
        let confirm = app.buttons["Confirm correction"]
        try reading.reveal(confirm)
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        try chooseBack(app, title: "Correct entry", keep: true)
        XCTAssertTrue(confirm.exists)
        try chooseBack(app, title: "Correct entry", keep: false)
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    private func reader(_ app: XCUIApplication) -> AssistantFinancialHistoryMaximumReading {
        AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
    }

    private func editAndDiscardNote(_ app: XCUIApplication, title: String) throws {
        let note = app.textFields["Note (optional)"]
        let reading = reader(app)
        try reading.reveal(note)
        note.tap()
        note.typeText("Unsent note QA")
        try chooseBack(app, title: title, keep: true)
        XCTAssertEqual(note.value as? String, "Unsent note QA")
        try chooseBack(app, title: title, keep: false)
    }

    private func chooseBack(_ app: XCUIApplication, title: String, keep: Bool) throws {
        let reading = reader(app)
        let back = app.navigationBars[title].buttons["Back"]
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let choice = alert.buttons[keep ? "Keep editing" : "Discard edits"]
        try reading.requireTarget(choice, bounds: app.frame)
        reading.capture(choice, name: "Owned \(title) draft Back choice before selection")
        choice.tap()
    }

    private func pristineBack(_ app: XCUIApplication, title: String) throws {
        let back = app.navigationBars[title].buttons.element(boundBy: 0)
        try reader(app).requireTarget(back, bounds: app.frame)
        back.tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        XCTAssertFalse(app.navigationBars[title].exists)
    }

    private func openLink(_ label: String, title: String, app: XCUIApplication) throws {
        let link = app.buttons[label]
        try reader(app).reveal(link)
        try reader(app).requireTarget(link)
        link.tap()
        XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 20))
        let ready = title == "Correct entry" ? app.buttons["Review correction"] : app.textFields["Note (optional)"]
        try reader(app).reveal(ready)
        XCTAssertTrue(ready.waitForExistence(timeout: 30))
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
    }

    private func openSource(_ app: XCUIApplication) throws {
        let source = app.buttons["money-event-1ec7156d-277a-4501-8231-c1a12a52b8ef"]
        try reader(app).reveal(source)
        try reader(app).requireTarget(source)
        source.tap()
        XCTAssertTrue(app.navigationBars["Entry details"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.staticTexts["Nest QA PDF posted 20261005"].waitForExistence(timeout: 20))
    }

    private func openMoney() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_MONEY_DRAFT_BACK"] == "20261007-no-save" else {
            throw XCTSkip("Explicit fictional payment/refund/correction drafts; no financial saves")
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
        return app
    }
}
