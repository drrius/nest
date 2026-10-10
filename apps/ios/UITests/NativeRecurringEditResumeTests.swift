import XCTest

@MainActor
final class NativeRecurringEditResumeTests: XCTestCase {
    private let title = "Nest QA variable resume 20261007"
    private let note = "Fictional variable rule edited before resumption."

    func testOwnedVariableRuleEditPauseResumeCancelPreservesFinancialHistory() throws {
        let app = try ownedApp()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        if ProcessInfo.processInfo.environment["NEST_QA_RECURRING_EXISTING_RULE"] != nil {
            try tap("Recurring expenses", app: app, reader: reader)
            try openCreatedRule(app, reader: reader)
        } else {
            try create(app, reader: reader)
        }
        if ProcessInfo.processInfo.environment["NEST_QA_RECURRING_RESUME_COMPLETED"] == nil {
            if ProcessInfo.processInfo.environment["NEST_QA_RECURRING_EDIT_COMPLETED"] == note {
                try reader.read(note)
            } else {
                try edit(app, reader: reader)
            }
            try pauseAndResume(app, reader: reader)
        }
        try tap("Refresh rule", app: app, reader: reader)
        try reader.read("Active", searchEarlier: true)
        try reader.read(note)
        try tap("Manage rule", app: app, reader: reader)
        try change("Cancel rule", result: "Rule cancelled.", app: app, reader: reader)
        back(app)
        back(app)
        back(app)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func pauseAndResume(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Manage rule", app: app, reader: reader)
        try change("Pause rule", result: "Rule paused.", app: app, reader: reader)
        back(app)
        try tap("Resume or recover resume", app: app, reader: reader)
        try reader.read("Resuming restarts bill reminders. Each amount and split still needs confirmation.")
        try tap("Review resume", app: app, reader: reader)
        try reader.read("Confirm each bill", searchEarlier: true)
        try reader.read("First due, 2026-11-01")
        try tap("Confirm resume", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Rule resumed."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Rule resumed."], name: "Explicit variable-rule resumption recorded")
        try tap("Done", app: app, reader: reader)
        back(app)
    }

    private func create(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Recurring expenses", app: app, reader: reader)
        try tap("New recurring expense", app: app, reader: reader)
        try fill("Description", value: title, app: app, reader: reader)
        try tap("Done", app: app, reader: reader, keyboard: true)
        try tap("Review rule", app: app, reader: reader)
        try reader.read("Confirm amount and split each cycle", searchEarlier: true)
        try reader.read("First due, 2026-11-01")
        try tap("Save bill reminders", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Rule saved · active."].waitForExistence(timeout: 30))
        try tap("Done", app: app, reader: reader)
        back(app)
        try openCreatedRule(app, reader: reader)
    }

    private func openCreatedRule(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        try reader.reveal(row)
        try reader.requireTarget(row)
        row.tap()
        try reader.read(title, searchEarlier: true)
    }

    private func edit(_ app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading) throws {
        try tap("Edit rule or recover save", app: app, reader: reader)
        try fill("Note (optional)", value: note, app: app, reader: reader)
        try tap("Done", app: app, reader: reader, keyboard: true)
        try tap("Review rule", app: app, reader: reader)
        try reader.read(note)
        try tap("Save bill reminders", app: app, reader: reader)
        XCTAssertTrue(app.staticTexts["Rule saved · active."].waitForExistence(timeout: 30))
        reader.capture(app.staticTexts["Rule saved · active."], name: "Variable rule edit recorded")
        try tap("Done", app: app, reader: reader)
        back(app)
        try tap("Refresh rule", app: app, reader: reader)
        try reader.read(note)
    }

    private func change(
        _ label: String, result: String, app: XCUIApplication, reader: AssistantFinancialHistoryMaximumReading
    ) throws {
        try tap(label, app: app, reader: reader)
        let dialog = app.sheets.firstMatch
        XCTAssertTrue(dialog.waitForExistence(timeout: 10))
        dialog.buttons[label].tap()
        XCTAssertTrue(app.staticTexts[result].waitForExistence(timeout: 30))
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
        for _ in 0..<3 {
            if !keyboard { try reader.reveal(button, searchEarlier: label == "Manage rule") }
            let enabled = XCTNSPredicateExpectation(
                predicate: NSPredicate { _, _ in button.exists && button.isEnabled && button.isHittable }, object: nil)
            if XCTWaiter.wait(for: [enabled], timeout: 3) == .completed {
                try reader.requireTarget(button, bounds: keyboard ? app.frame : nil)
                button.tap()
                return
            }
        }
        reader.capture(button, name: "Required action did not become enabled")
        XCTFail("Required action did not remain ready after bounded reveal: \(label)")
        throw NSError(domain: "NestNativeQA", code: 1)
    }

    private func back(_ app: XCUIApplication) {
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_RECURRING_EDIT_RESUME"] == "20261007-five-rule-writes" else {
            throw XCTSkip("Requires the owned variable-rule fixture and unchanged-history baseline")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_RECURRING_CLONE"])
        guard env["SIMULATOR_UDID"] == clone, UUID(uuidString: clone) != nil,
            !["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone)
        else { throw XCTSkip("Only the owned fictional-household clone may change this rule") }
        if let existing = env["NEST_QA_RECURRING_EXISTING_RULE"] {
            XCTAssertEqual(existing, "81cf96c0-6114-4523-99f5-1525f7c58240")
            if let resumed = env["NEST_QA_RECURRING_RESUME_COMPLETED"] {
                XCTAssertEqual(resumed, existing)
                XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "1")
            } else if let edited = env["NEST_QA_RECURRING_EDIT_COMPLETED"] {
                XCTAssertEqual(edited, note)
                XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "3")
            } else {
                XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "4")
            }
        } else {
            XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "5")
        }
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
