import XCTest

@MainActor
final class NativeExpenseSplitReviewTests: XCTestCase {
    private let alex = "791f7261-6c9d-4061-9c8a-57aa6e0b0200"
    private let sam = "e5f80cfd-b69a-4aa0-a267-75784e943676"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedPercentageBelongsToDisplayedPersonWithoutSaving() throws {
        let (app, name) = try openDraft()
        try select("Split", choice: "Percentage", app: app)
        try select("Paid by", choice: "Test Sam", app: app)
        let field = app.textFields.matching(NSPredicate(format: "label ENDSWITH %@", "’s percentage")).firstMatch
        try reader(app).reveal(field)
        let firstAlex = field.label == "Test Alex’s percentage"
        XCTAssertTrue(firstAlex || field.label == "Test Sam’s percentage")
        try enter(field, text: "25", app: app)
        try keyboardReview(app)
        try verify("expense-review-amount", value: "CHF 1.01", app: app)
        try verify("expense-review-payer", value: name == "Test Sam" ? "You" : "Test Sam", app: app)
        try verify("expense-share-\(alex)", value: firstAlex ? "CHF 0.25" : "CHF 0.76", app: app)
        try verify("expense-share-\(sam)", value: firstAlex ? "CHF 0.76" : "CHF 0.25", app: app)
        try discard(app)
    }

    func testOwnedExactSharesRejectMismatchAndReviewLiteralCentimesWithoutSaving() throws {
        let (app, _) = try openDraft()
        try select("Split", choice: "Exact", app: app)
        try select("Paid by", choice: "Test Sam", app: app)
        try enter(app.textFields["Test Alex’s share (CHF)"], text: "0.25", app: app)
        try keyboardReview(app)
        XCTAssertFalse(app.buttons["Save expense"].exists)
        let second = app.textFields["Test Sam’s share (CHF)"]
        try enter(second, text: "0.75", app: app)
        try keyboardReview(app)
        XCTAssertFalse(app.buttons["Save expense"].exists, "100 centimes cannot split a 101-centime expense")
        try enter(second, text: "0.76", app: app)
        try keyboardReview(app)
        try verify("expense-review-amount", value: "CHF 1.01", app: app)
        try verify("expense-share-\(alex)", value: "CHF 0.25", app: app)
        try verify("expense-share-\(sam)", value: "CHF 0.76", app: app)
        try discard(app)
    }

    private func reader(_ app: XCUIApplication) -> AssistantFinancialHistoryMaximumReading {
        AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
    }

    private func enter(_ field: XCUIElement, text: String, app: XCUIApplication) throws {
        try reader(app).reveal(field)
        field.tap()
        let previous = field.value as? String ?? ""
        let placeholder = field.placeholderValue ?? ""
        let count = previous == placeholder ? 0 : previous.count
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: count) + text)
        XCTAssertEqual(field.value as? String, text)
    }

    private func keyboardReview(_ app: XCUIApplication) throws {
        let button = app.buttons["expense.keyboard-review"]
        try reader(app).requireTarget(button, bounds: app.frame)
        button.tap()
    }

    private func select(_ title: String, choice: String, app: XCUIApplication) throws {
        let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        try reader(app).reveal(picker)
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true AND hittable == true"), object: picker)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 15), .completed)
        try reader(app).reveal(picker)
        try reader(app).requireTarget(picker)
        picker.tap()
        let option = app.buttons[choice]
        XCTAssertTrue(option.waitForExistence(timeout: 10))
        try reader(app).requireTarget(option, bounds: app.frame)
        option.tap()
        XCTAssertTrue(app.navigationBars["Add expense"].waitForExistence(timeout: 15))
    }

    private func verify(_ id: String, value: String, app: XCUIApplication) throws {
        let row = app.descendants(matching: .any).matching(identifier: id).firstMatch
        try reader(app).reveal(row)
        reader(app).capture(row, name: "Owned split review \(id) exact visible value")
        XCTAssertTrue(row.staticTexts[value].exists, "Expected literal value \(value) in owned review row \(id)")
    }

    private func discard(_ app: XCUIApplication) throws {
        let back = app.navigationBars["Add expense"].buttons["Back"]
        try reader(app).requireTarget(back, bounds: app.frame)
        back.tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let button = alert.buttons["Discard edits"]
        try reader(app).requireTarget(button, bounds: app.frame)
        button.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func openDraft() throws -> (XCUIApplication, String) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_SPLIT_REVIEW"] == "20261007-no-save" else {
            throw XCTSkip("Explicit fictional exact/percentage reviews; no Save permitted")
        }
        let names = [
            "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
            "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
        ]
        let name = try XCTUnwrap(names[try XCTUnwrap(env["SIMULATOR_UDID"])])
        XCTAssertEqual(env["NEST_QA_NAME"], name)
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        let add = app.buttons["Add expense"]
        try reader(app).reveal(add)
        try reader(app).requireTarget(add)
        add.tap()
        XCTAssertTrue(app.navigationBars["Add expense"].waitForExistence(timeout: 15))
        try enter(app.textFields["Description"], text: "Unsent split review QA", app: app)
        try keyboardReview(app)
        XCTAssertFalse(app.buttons["Save expense"].exists)
        try enter(app.textFields["Shared amount (CHF)"], text: "1.01", app: app)
        try keyboardReview(app)
        let edit = app.buttons["Edit"]
        try reader(app).reveal(edit)
        XCTAssertTrue(edit.waitForExistence(timeout: 15))
        try reader(app).requireTarget(edit)
        edit.tap()
        return (app, name)
    }
}
