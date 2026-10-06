import XCTest

@MainActor
final class NativeFixedCalendarReadingTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testLargestPermissionTextHasContinuousCoverageAndVisibleAccessTarget() throws {
        try requireFixture()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self)
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        defer {
            let today = tabs.buttons["Today"]
            if today.exists && today.isHittable {
                today.tap()
                XCTAssertTrue(today.isSelected)
            }
        }
        let calendar = tabs.buttons["Calendar"]
        try reading.requireTarget(calendar, bounds: app.frame)
        calendar.tap()
        let explanation = "Nest reads the calendars you choose. It does not create, change or delete events."
        let terminology = "iOS calls this Full Access. Nest uses it only to read your calendars."
        XCTAssertTrue(reading.element(explanation).waitForExistence(timeout: 20))
        try reading.read(explanation)
        try reading.read(terminology)
        let access = app.buttons["Allow calendar access"]
        try reading.reveal(access)
        try reading.requireTarget(access)
        reading.capture(access, name: "Largest Calendar access target fully visible without pressing")
    }

    private func requireFixture() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_FIXED_CALENDAR_READING"] == "20261006-owner-ax5" else {
            throw XCTSkip("Dated fictional Calendar reading; no permission grant or command")
        }
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_NAME"], "Test Alex")
        XCTAssertEqual(env["NEST_QA_ACTOR"], "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        XCTAssertEqual(env["NEST_QA_HOUSEHOLD"], "be772ffd-3ab5-41d5-8438-647a79a553da")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_INITIAL_APPEARANCE"], "dark")
        XCTAssertEqual(env["NEST_QA_INITIAL_CONTENT_SIZE"], "accessibility-extra-extra-extra-large")
    }
}
