import XCTest

@MainActor
final class NativePortionSaveTests: XCTestCase {
    func testOwnedVariedPortionPersistsAcrossRestartAndRestoresThroughSave() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_PORTION_SAVE"] == "20261007-alex-two-saves" else {
            throw XCTSkip("Explicit fictional portion variation and normal restoration")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_NAME"], "Test Alex")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "2")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        try openPreferences(app)
        try chooseAndSave(1.5, baseline: 1, app: app)
        app.terminate()
        app.launch()
        try openPreferences(app)
        let picker = portionPicker(app)
        try reader(app).reveal(picker)
        XCTAssertEqual(picker.value as? String, 1.5.formatted())
        reader(app).capture(picker, name: "Saved varied portion after actual process restart")
        try chooseAndSave(1, baseline: 1.5, app: app)
        app.terminate()
        app.launch()
        try openPreferences(app)
        try reader(app).reveal(picker)
        XCTAssertEqual(picker.value as? String, 1.formatted())
        reader(app).capture(picker, name: "Original portion restored through normal Save and restart")
        try returnToToday(app)
    }

    func testOwnedRestoredPortionReadbackAndReturnWithoutSaving() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_PORTION_READBACK"] == "20261007-restored-alex" else {
            throw XCTSkip("Read-only follow-up after consumed portion Save budget")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_NAME"], "Test Alex")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        try openPreferences(app)
        let picker = portionPicker(app)
        try reader(app).reveal(picker)
        XCTAssertEqual(picker.value as? String, 1.formatted())
        reader(app).capture(picker, name: "Read-only restored portion after two consumed saves")
        try returnToToday(app)
    }

    private func returnToToday(_ app: XCUIApplication) throws {
        let back = app.navigationBars["Your food preferences"].buttons.element(boundBy: 0)
        try reader(app).requireTarget(back, bounds: app.frame)
        back.tap()
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        let profileBack = app.navigationBars["Profile"].buttons.element(boundBy: 0)
        try reader(app).requireTarget(profileBack, bounds: app.frame)
        profileBack.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func reader(_ app: XCUIApplication) -> AssistantFinancialHistoryMaximumReading {
        AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
    }

    private func portionPicker(_ app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Your portion")).firstMatch
    }

    private func openPreferences(_ app: XCUIApplication) throws {
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        let profile = app.buttons["tab-profile-action"]
        try reader(app).requireTarget(profile, bounds: app.frame)
        profile.tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        let link = app.buttons["Your food preferences"]
        try reader(app).reveal(link)
        try reader(app).requireTarget(link)
        link.tap()
        let save = app.navigationBars["Your food preferences"].buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
    }

    private func chooseAndSave(_ value: Double, baseline: Double, app: XCUIApplication) throws {
        let picker = portionPicker(app)
        try reader(app).reveal(picker)
        XCTAssertEqual(picker.value as? String, baseline.formatted())
        try reader(app).requireTarget(picker)
        picker.tap()
        let option = app.buttons[value.formatted()]
        XCTAssertTrue(option.waitForExistence(timeout: 10))
        try reader(app).requireTarget(option, bounds: app.frame)
        option.tap()
        XCTAssertTrue(app.navigationBars["Your food preferences"].waitForExistence(timeout: 15))
        let save = app.navigationBars["Your food preferences"].buttons["Save"]
        try reader(app).requireTarget(save, bounds: app.frame)
        save.tap()
        let notice = app.staticTexts["Saved. These are your current food preferences."]
        try reader(app).reveal(notice)
        XCTAssertTrue(notice.exists)
        reader(app).capture(notice, name: "Confirmed one owned portion Save")
    }
}
