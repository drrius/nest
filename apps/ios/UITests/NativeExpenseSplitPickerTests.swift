import XCTest

@MainActor
final class NativeExpenseSplitPickerTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedSplitChoicesHaveFullSizedTargetsWithoutSaving() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_SPLIT_PICKER"] == "20261007-no-save" else {
            throw XCTSkip("Explicit fictional expense split navigation; no financial save")
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
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let add = app.buttons["Add expense"]
        try reading.reveal(add)
        try reading.requireTarget(add)
        add.tap()
        XCTAssertTrue(app.navigationBars["Add expense"].waitForExistence(timeout: 20))
        for choice in ["Percentage", "Exact", "Equal"] {
            let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Split")).firstMatch
            try reading.reveal(picker)
            try reading.requireTarget(picker)
            picker.tap()
            let option = app.buttons[choice]
            XCTAssertTrue(option.waitForExistence(timeout: 10))
            reading.capture(option, name: "Owned expense \(choice) split option before selection")
            try reading.requireTarget(option, bounds: app.frame)
            option.tap()
        }
        let back = app.navigationBars["Add expense"].buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        XCTAssertFalse(
            app.alerts["Discard edits?"].exists, "Returning to untouched Equal should restore the raw baseline")
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
