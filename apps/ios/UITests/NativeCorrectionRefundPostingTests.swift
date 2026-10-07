import XCTest

@MainActor
final class NativeCorrectionRefundPostingTests: XCTestCase {
    private let title = "Nest QA correction-refund original 20261007"

    func testOwnedExpenseReplacementAndRefundRestoreStartingBalance() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let stage = ProcessInfo.processInfo.environment["NEST_QA_CORRECTION_REFUND_STAGE"] ?? "begin"
        if stage == "resume_recorded_expense" {
            try tap("Add expense", app: app, reader: reader)
            XCTAssertTrue(app.staticTexts["Expense recorded."].waitForExistence(timeout: 20))
            try tap("View recorded entry", app: app, reader: reader)
            try reader.read(title, searchEarlier: true)
        } else {
            XCTAssertEqual(stage, "begin")
            try expense(app, reader: reader)
        }
        try correction(app, reader: reader)
        try refund(app, reader: reader)
        back(app)
        try tap("Done", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["No refundable amount remains on this entry."].waitForExistence(timeout: 20))
        back(app)
        requireNoDiscard(app)
        back(app)
        try tap("Done", app: app, reader: reader)
        back(app)
        requireNoDiscard(app)
        back(app)
        try tap("Start another expense", app: app, reader: reader)
        XCTAssertTrue(app.textFields["Description"].waitForExistence(timeout: 15))
        back(app)
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func expense(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Add expense", app: app, reader: reader)
        try fill("Description", value: title, app: app, reader: reader)
        try fill("Shared amount (CHF)", value: "0.02", app: app, reader: reader)
        let review = app.buttons["expense.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("CHF 0.02")
        try tap("Save expense", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Expense recorded."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Expense recorded."], name: "Owned two-cent expense recorded")
        try tap("View recorded entry", app: app, reader: reader)
        try reader.read(title, searchEarlier: true)
    }

    private func correction(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Correct entry", app: app, reader: reader)
        XCTAssertTrue(app.navigationBars["Correct entry"].waitForExistence(timeout: 20))
        let mode = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Correction")).firstMatch
        try reader.reveal(mode)
        reader.capture(mode, name: "Correction mode picker before target check")
        try reader.requireTarget(mode)
        mode.tap()
        let replace = app.buttons["Replace entry"]
        XCTAssertTrue(replace.waitForExistence(timeout: 10))
        replace.tap()
        try fill("Note (optional)", value: "Fictional corrected details; no actual transfer.", app: app, reader: reader)
        let review = app.buttons["correction.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("Replace with: " + title)
        try reader.read("CHF 0.02")
        try reader.read("Fictional corrected details; no actual transfer.")
        try tap("Confirm correction", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Correction recorded."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Correction recorded."], name: "Append-only replacement recorded")
        try tap("View correction", app: app, reader: reader)
        try reader.read(title, searchEarlier: true)
        try reader.read("Fictional corrected details; no actual transfer.")
        try reader.read("Replacement", searchEarlier: true)
    }

    private func refund(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Record refund", app: app, reader: reader)
        XCTAssertTrue(app.navigationBars["Record refund"].waitForExistence(timeout: 20))
        try fill("Your refund share (CHF)", value: "0.01", app: app, reader: reader)
        try fill("Partner’s refund share (CHF)", value: "0.01", app: app, reader: reader)
        let review = app.buttons["refund.keyboard-review"]
        try reader.requireTarget(review, bounds: app.frame)
        review.tap()
        try reader.read("Total, CHF 0.02")
        try reader.read("You, CHF 0.01")
        try reader.read("Your partner, CHF 0.01")
        try tap("Record refund", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Refund recorded."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Refund recorded."], name: "Replacement refund recorded")
        try tap("View recorded refund", app: app, reader: reader)
        try reader.read("Refund", searchEarlier: true)
        try reader.read("CHF 0.02", searchEarlier: true)
    }

    private func fill(
        _ label: String, value: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading
    ) throws {
        let field = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label == %@ AND (elementType == %@ OR elementType == %@)", label,
                NSNumber(value: XCUIElement.ElementType.textField.rawValue),
                NSNumber(value: XCUIElement.ElementType.textView.rawValue))
        ).firstMatch
        try reader.reveal(field)
        XCTAssertTrue(field.exists)
        field.tap()
        field.typeText(value)
        XCTAssertEqual(field.value as? String, value)
    }

    private func tap(_ label: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        let button = app.buttons[label]
        try reader.reveal(button)
        XCTAssertTrue(button.exists)
        try reader.requireTarget(button)
        button.tap()
    }

    private func back(_ app: XCUIApplication) {
        let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        XCTAssertTrue(back.isHittable)
        back.tap()
    }

    private func requireNoDiscard(_ app: XCUIApplication) {
        let alert = app.alerts["Discard edits?"]
        XCTAssertFalse(alert.waitForExistence(timeout: 2), "A finished action must not ask to discard recorded input")
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_CORRECTION_REFUND"] == "20261007-three-fixture-writes" else {
            throw XCTSkip("Requires the owned fictional correction/refund budget and financial baseline")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_CORRECTION_REFUND_CLONE"])
        guard env["SIMULATOR_UDID"] == clone, UUID(uuidString: clone) != nil,
            !["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone)
        else { throw XCTSkip("Only the owned test-household clone may perform this journey") }
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "3")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        back(app)
        app.tabBars.firstMatch.buttons["Money"].tap()
        return app
    }
}
