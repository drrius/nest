import XCTest

@MainActor
final class NativePortionPreferenceDraftTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedUnsentPortionSurvivesKeepEditingAndDiscard() throws {
        let name = try requireFixture()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        tabs.buttons["Today"].tap()
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let profile = app.buttons["tab-profile-action"]
        try reading.requireTarget(profile, bounds: app.frame)
        profile.tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        let link = app.buttons["Your food preferences"]
        try reading.reveal(link)
        try reading.requireTarget(link)
        link.tap()
        let navigation = app.navigationBars["Your food preferences"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        let save = navigation.buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
        let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Your portion")).firstMatch
        try reading.reveal(picker)
        try reading.requireTarget(picker)
        XCTAssertTrue(hasSelection(picker, value: 1.formatted()))
        reading.capture(picker, name: "Original owned portion before unsent change")
        picker.tap()
        let proposed = (name == "Test Alex" ? 1.5 : 0.5).formatted()
        let option = app.buttons[proposed]
        XCTAssertTrue(option.waitForExistence(timeout: 10))
        try reading.requireTarget(option, bounds: app.frame)
        option.tap()
        let selected = XCTNSPredicateExpectation(
            predicate: NSPredicate(
                format: "hittable == true AND (value == %@ OR label == %@)", proposed, "Your portion, \(proposed)"),
            object: picker)
        XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 15), .completed)
        let back = navigation.buttons["Back"]
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let keep = alert.buttons["Keep editing"]
        try reading.requireTarget(keep, bounds: app.frame)
        keep.tap()
        XCTAssertTrue(hasSelection(picker, value: proposed))
        reading.capture(picker, name: "Owned unsent portion retained after Keep editing")
        back.tap()
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        let discard = alert.buttons["Discard edits"]
        try reading.requireTarget(discard, bounds: app.frame)
        discard.tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        link.tap()
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        let reloaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [reloaded], timeout: 30), .completed)
        try reading.reveal(picker)
        XCTAssertTrue(hasSelection(picker, value: 1.formatted()))
        reading.capture(picker, name: "Original portion restored after explicit unsent discard")
        let unchangedBack = navigation.buttons.element(boundBy: 0)
        try reading.requireTarget(unchangedBack, bounds: app.frame)
        unchangedBack.tap()
        XCTAssertFalse(alert.exists)
        app.navigationBars["Profile"].buttons.element(boundBy: 0).tap()
        tabs.buttons["Today"].tap()
        XCTAssertTrue(tabs.buttons["Today"].isSelected)
    }

    private func hasSelection(_ picker: XCUIElement, value: String) -> Bool {
        picker.value as? String == value || picker.label == "Your portion, \(value)"
    }

    private func requireFixture() throws -> String {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_PORTION_DRAFT"] == "20261007-unsaved-pair" else {
            throw XCTSkip("Explicit fictional member portion draft; no Save is permitted")
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
        return name
    }
}
