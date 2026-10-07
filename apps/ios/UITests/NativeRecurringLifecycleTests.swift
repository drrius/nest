import XCTest

@MainActor
final class NativeRecurringLifecycleTests: XCTestCase {
    private let title = "Nest QA fixed rule 20261007"

    func testOwnedFixedRuleCreatePauseCancelWithoutFinancialPosting() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        try tap("Recurring expenses", app: app, reader: reader)
        try tap("New recurring expense", app: app, reader: reader)
        try fill("Description", value: title, app: app, reader: reader)
        let recording = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Recording")).firstMatch
        try reader.reveal(recording)
        reader.capture(recording, name: "Recurring recording mode target")
        try reader.requireTarget(recording)
        recording.tap()
        app.buttons["Automatic fixed expense"].tap()
        try fill("Amount (CHF)", value: "0.02", app: app, reader: reader)
        try fill("Test Alex share (CHF)", value: "0.01", app: app, reader: reader)
        try fill("Test Sam share (CHF)", value: "0.01", app: app, reader: reader)
        try tap("Done", app: app, reader: reader, keyboard: true)
        try tap("Review rule", app: app, reader: reader)
        try reader.read("Automatically recorded each cycle", searchEarlier: true)
        try reader.read("CHF 0.02")
        try reader.read("Monthly, day 1")
        try reader.read("First due, 2026-11-01")
        try tap("Save automatic rule", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Rule saved · active."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Rule saved · active."], name: "Explicit automatic mandate saved")
        try tap("View saved rule", app: app, reader: reader)
        try reader.read(title, searchEarlier: true)
        try tap("Manage rule", app: app, reader: reader)
        try change("Pause rule", result: "Rule paused.", app: app, reader: reader)
        try change("Cancel rule", result: "Rule cancelled.", app: app, reader: reader)
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        try tap("Done", app: app, reader: reader)
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func change(
        _ label: String, result: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading
    ) throws {
        try tap(label, app: app, reader: reader)
        let dialog = app.sheets.firstMatch
        XCTAssertTrue(dialog.waitForExistence(timeout: 10))
        let confirm = dialog.buttons[label]
        XCTAssertTrue(confirm.isHittable)
        confirm.tap()
        XCTAssertTrue(app.staticTexts[result].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts[result], name: result)
        try tap("Done", app: app, reader: reader)
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
        try reader.reveal(field, searchEarlier: label == "Description")
        field.tap()
        field.typeText(value)
        XCTAssertEqual(field.value as? String, value)
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
        guard env["NEST_QA_RECURRING_LIFECYCLE"] == "20261007-three-rule-writes" else {
            throw XCTSkip("Requires the owned recurring-rule fixture and retained-history baseline")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_RECURRING_CLONE"])
        guard env["SIMULATOR_UDID"] == clone, UUID(uuidString: clone) != nil,
            !["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone)
        else { throw XCTSkip("Only the owned fictional-household clone may change these rules") }
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "3")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        return app
    }
}
