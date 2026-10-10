import XCTest

@MainActor
final class NativeChoreScheduleConflictTests: XCTestCase {
    private var kind: String { ProcessInfo.processInfo.environment["NEST_QA_CONFLICT_KIND"] ?? "reschedule" }
    private var title: String { "Nest native \(kind == "reschedule" ? "schedule" : kind) conflict 20261007" }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testWarmOwnedChoreWithoutCompleting() throws {
        let app = try open("warm")
        let chore = app.buttons[title]
        try reader(app).reveal(chore)
        XCTAssertEqual(chore.value as? String, "Due today")
        reader(app).capture(chore, name: "Original scheduled chore before outage")
    }

    func testQueueOwnedCompletionOnceDuringOutage() throws {
        let app = try open("queue")
        let chore = app.buttons[title]
        try reader(app).reveal(chore)
        try reader(app).requireTarget(chore)
        XCTAssertEqual(chore.value as? String, "Due today")
        chore.tap()
        try expectValue("Saved on this iPhone · syncs when online", app: app)
        XCTAssertFalse(app.buttons[title].isEnabled)
    }

    func testQueuedCompletionSurvivesRestart() throws {
        let app = try open("restart")
        app.terminate()
        app.launch()
        try expectValue("Saved on this iPhone · syncs when online", app: app)
        XCTAssertFalse(app.buttons[title].isEnabled)
    }

    func testReconnectExplainsConflictThenDiscardsOnlySavedCompletion() throws {
        let app = try open("recover")
        try expectValue("This chore changed. Your saved completion was not applied.", app: app)
        let discard = app.buttons["Discard saved change"]
        try reader(app).reveal(discard)
        try reader(app).requireTarget(discard)
        reader(app).capture(discard, name: "Schedule conflict and explicit recovery")
        discard.tap()
        let cleared = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: discard)
        XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 20), .completed)
        XCTAssertFalse(app.buttons[title].exists)
        XCTAssertFalse(app.descendants(matching: .any).matching(identifier: title).firstMatch.exists)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func reader(_ app: XCUIApplication) -> AssistantFinancialHistoryMaximumReading {
        AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
    }

    private func expectValue(_ value: String, app: XCUIApplication) throws {
        let row = app.descendants(matching: .any).matching(identifier: title).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: row)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        try reader(app).reveal(row)
        reader(app).capture(row, name: value)
    }

    private func open(_ action: String) throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_SCHEDULE_CONFLICT"] == "20261007", env["NEST_QA_ACTION"] == action else {
            throw XCTSkip("Requires the exact prepared native schedule-conflict action")
        }
        XCTAssertTrue(["reschedule", "skip", "archive"].contains(kind))
        #if targetEnvironment(simulator)
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        #else
            throw XCTSkip("Fictional schedule-conflict fixtures are forbidden on phones")
        #endif
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], action == "queue" ? "1" : "0")
        XCTAssertEqual(
            env["NEST_QA_API_ORIGIN"], kind == "reschedule" ? "https://localhost:4665" : "https://localhost:4666")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        return app
    }
}
