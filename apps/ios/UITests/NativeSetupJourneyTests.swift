import XCTest

@MainActor
final class NativeSetupJourneyTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedOptionalSetupNavigationAndStart() throws {
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
        let setup = app.buttons["Your setup"]
        try reading.reveal(setup)
        try reading.requireTarget(setup)
        setup.tap()
        XCTAssertTrue(app.navigationBars["Your setup"].waitForExistence(timeout: 15))
        try reading.read(
            "Choose what helps you. Each part is optional, and you can return from Profile whenever you like.")
        try reading.read("You and your partner have separate personal preferences. Cooking choices are shared.")
        try checkStatus("Your food preferences", configured: name == "Test Alex", app: app)
        try visitPreferences("Your food preferences", title: "Your food preferences", app: app)
        try checkStatus("Cooking preferences", configured: true, app: app)
        try visitPreferences("Cooking preferences", title: "Cooking preferences", app: app)
        let calendar = link("Calendars and busy sharing", app: app)
        try reading.reveal(calendar)
        try reading.requireTarget(calendar)
        reading.capture(calendar, name: "Owned setup Calendar handoff before read-only opening")
        calendar.tap()
        XCTAssertTrue(app.staticTexts["tab-header-calendar"].waitForExistence(timeout: 20))
        try reading.read("Nest reads the calendars you choose. It does not create, change or delete events.")
        try reading.read("iOS calls this Full Access. Nest uses it only to read your calendars.")
        try returnSetup(app)
        try checkStatus("Notification choices", configured: name == "Test Alex", app: app)
        try visitPreferences("Notification choices", title: "Notifications", app: app)
        try reading.read("You can finish any of these later from Profile.")
        let start = app.buttons["Get started"]
        try reading.reveal(start)
        try reading.requireTarget(start)
        reading.capture(start, name: "Owned optional setup Get started without saves or permission requests")
        start.tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        let back = app.navigationBars["Profile"].buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        tabs.buttons["Today"].tap()
        XCTAssertTrue(tabs.buttons["Today"].isSelected)
    }

    private func link(_ title: String, app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
    }

    private func checkStatus(_ title: String, configured: Bool, app: XCUIApplication) throws {
        let row = link(title, app: app)
        let expected = configured ? "Choices saved" : "Not chosen yet"
        let loaded = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == true AND label CONTAINS %@", expected), object: row)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
    }

    private func visitPreferences(_ label: String, title: String, app: XCUIApplication) throws {
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let row = link(label, app: app)
        try reading.reveal(row)
        try reading.requireTarget(row)
        reading.capture(row, name: "Owned setup \(label) before read-only opening")
        row.tap()
        let navigation = app.navigationBars[title]
        XCTAssertTrue(navigation.waitForExistence(timeout: 20))
        let save = navigation.buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
        switch label {
        case "Your food preferences":
            try reading.read(
                "Your dietary preferences help plan household meals. Your calorie goal stays out of your partner’s profile and chat."
            )
        case "Cooking preferences":
            try reading.read("Already-planned meals stay visible even when their slot is hidden.")
        case "Notification choices":
            try reading.read("Choose what Nest may send to you. Your partner has separate choices.")
            try reading.read("Saving these choices does not grant iPhone notification permission.")
        default:
            XCTFail("Only the three prepared preference handoffs are permitted")
        }
        try returnSetup(app)
    }

    private func returnSetup(_ app: XCUIApplication) throws {
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let back = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        XCTAssertTrue(app.navigationBars["Your setup"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.alerts["Discard edits?"].exists)
    }

    private func requireFixture() throws -> String {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SETUP_JOURNEY"] == "20261007-read-only-pair" else {
            throw XCTSkip("Explicit fictional optional-setup journey; no saves or permission grants")
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
