import XCTest

@MainActor
final class NativeExpenseReviewStartTests: XCTestCase {
    func testOwnedReviewStartsAtAmountAndEditRetainsDraftWithoutSaving() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_REVIEW_START"] == "20261007-no-save" else {
            throw XCTSkip("Explicit fictional expense review transition; no Save")
        }
        continueAfterFailure = false
        XCTAssertTrue(
            ["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"]
                .contains(try XCTUnwrap(env["SIMULATOR_UDID"])))
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let add = app.buttons["Add expense"]
        try reader.reveal(add)
        try reader.requireTarget(add)
        add.tap()
        let description = app.textFields["Description"]
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        description.tap()
        description.typeText("QA")
        let amount = app.textFields["Shared amount (CHF)"]
        amount.tap()
        amount.typeText("1.01")
        let review = app.buttons["expense.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        let value = app.descendants(matching: .any).matching(identifier: "expense-review-amount").firstMatch
        XCTAssertTrue(value.waitForExistence(timeout: 15))
        reader.capture(value, name: "Review amount before any scroll")
        XCTAssertTrue(try reader.viewport().contains(value.frame), "Review must start at its amount without scrolling")
        XCTAssertEqual(value.label, "CHF 1.01")
        reader.capture(value, name: "Review starts with exact amount fully visible")
        let edit = app.buttons["Edit"]
        try reader.reveal(edit)
        try reader.requireTarget(edit)
        edit.tap()
        XCTAssertTrue(description.waitForExistence(timeout: 15))
        XCTAssertTrue(try reader.viewport().contains(description.frame), "Edit starts at retained description")
        XCTAssertEqual(description.value as? String, "QA")
        XCTAssertEqual(amount.value as? String, "1.01")
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
}
