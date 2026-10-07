import XCTest

@MainActor
final class NativeSettlementReviewTests: XCTestCase {
    func testOwnedFullPaymentReviewStartsAtDetailsAndEditRetainsNote() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SETTLEMENT_REVIEW"] == "20261007-no-save" else {
            throw XCTSkip("Owned fictional settlement review; no payment recording")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
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
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let payment = app.buttons["Record a payment"]
        try reader.reveal(payment)
        try reader.requireTarget(payment)
        payment.tap()
        XCTAssertTrue(app.navigationBars["Record payment"].waitForExistence(timeout: 20))
        let note = app.textFields["Note (optional)"]
        try reader.reveal(note)
        note.tap()
        note.typeText("Unsent payment QA")
        let done = app.buttons["Done"]
        try reader.requireTarget(done, bounds: app.frame)
        done.tap()
        let review = app.buttons["Review payment"]
        try reader.reveal(review)
        try reader.requireTarget(review)
        review.tap()
        let amount = reader.element("CHF 0.01")
        XCTAssertTrue(amount.waitForExistence(timeout: 15))
        reader.capture(amount, name: "Payment review amount before scrolling")
        XCTAssertTrue(try reader.viewport().contains(amount.frame), "Review starts with its exact amount visible")
        try reader.read("Confirm only if this payment has already happened.")
        let edit = app.buttons["Edit"]
        try reader.reveal(edit)
        try reader.requireTarget(edit)
        edit.tap()
        let fullBalance = reader.element("CHF 0.01")
        XCTAssertTrue(fullBalance.waitForExistence(timeout: 15))
        reader.capture(fullBalance, name: "Payment edit current balance before scrolling")
        XCTAssertTrue(try reader.viewport().contains(fullBalance.frame), "Edit starts at its current balance")
        try reader.reveal(note)
        XCTAssertEqual(note.value as? String, "Unsent payment QA")
        let back = app.navigationBars["Record payment"].buttons["Back"]
        try reader.requireTarget(back, bounds: app.frame)
        back.tap()
        let discard = app.alerts["Discard edits?"].buttons["Discard edits"]
        XCTAssertTrue(discard.waitForExistence(timeout: 10))
        try reader.requireTarget(discard, bounds: app.frame)
        discard.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
