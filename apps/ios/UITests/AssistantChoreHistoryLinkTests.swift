import XCTest

@MainActor
final class AssistantChoreHistoryLinkTests: XCTestCase {
    private let conversation = "24a1602a-8ec7-4ff9-a22d-ef6c3ab1a567"
    private let operation = "90d2eb88-3f35-4a0b-b380-7e9c4db25a7c"
    private let occurrence = "61673c1e-992d-4bc9-9381-6e1248787728"
    private let provenance =
        "Synthetic private-history navigation fixture importing an already-recorded native chore acknowledgment. No model was called and no completion was performed for this fixture."
    private let imported =
        "This test card imports the existing native acknowledgment. It is not a newly executed AI tool or a completed model turn."
    private let explanation =
        "This is the saved acknowledgement. The scheduled chores below show the current household work."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testImportedPartnerCompletionOpensCurrentScheduledWorkWithoutReplaying() throws {
        try requireFixture()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self)
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        defer { try? restoreToday(app, reading: reading) }
        try openOwnerHistory(app, reading: reading)
        let row = app.buttons["assistant-conversation-\(conversation)"]
        try reading.reveal(row)
        reading.capture(row, name: "Exact synthetic imported chore conversation target")
        try reading.requireTarget(row)
        row.tap()
        XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 20))
        try reading.read("Only you can see this chat")
        try reading.read(provenance)
        try reading.read(imported)
        try reading.read("This chore was already completed.")
        let links = app.buttons.matching(NSPredicate(format: "label == %@", "View current scheduled chores"))
        try reading.reveal(links.firstMatch)
        XCTAssertEqual(links.count, 1)
        let link = links.firstMatch
        reading.capture(link, name: "Imported completion current-work link before tap")
        try reading.requireTarget(link)
        link.tap()
        XCTAssertTrue(app.navigationBars["Scheduled chores"].waitForExistence(timeout: 20))
        try assertAcknowledgment(reading)
        reading.capture(reading.element(explanation), name: "Original partner completion and current-work explanation")
        try reading.read("Hosted smoke tidy kitchen")
        try reading.read("Due 2026-09-28")
        reading.capture(reading.element("Hosted smoke tidy kitchen"), name: "Current authorized household work")
        try pullToRefresh(app, reading: reading)
        try assertAcknowledgment(reading)
        try reading.read("Hosted smoke tidy kitchen")
        try reading.read("Due 2026-09-28")
        reading.capture(
            reading.element("Hosted smoke tidy kitchen"), name: "Current work retained after measured refresh")
        try reading.back(from: "Scheduled chores", to: "Conversation")
        try reading.back(from: "Conversation", to: "Ask Nest")
        let back = app.navigationBars["Ask Nest"].buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        try restoreToday(app, reading: reading)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        reading.capture(app.buttons["Me + shared"], name: "Original Today after imported chore navigation")
    }

    private func requireFixture() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_ASSISTANT_CHORE_HISTORY"] == "20261006-normal-light-imported-receipt" else {
            throw XCTSkip("Opt-in existing fictional chore acknowledgment navigation only")
        }
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_MANUAL_WEEK"], "20261005")
        XCTAssertEqual(env["NEST_QA_MANUAL_WEEK_ACTION"], "assistant_chore_history_link")
        XCTAssertEqual(env["NEST_QA_MANUAL_WEEK_NAME"], "Test Alex")
        XCTAssertEqual(env["NEST_QA_ASSISTANT_CONVERSATION"], conversation)
        XCTAssertEqual(env["NEST_QA_CHORE_OPERATION"], operation)
        XCTAssertEqual(env["NEST_QA_CHORE_OCCURRENCE"], occurrence)
        XCTAssertEqual(env["NEST_QA_CHORE_OUTCOME"], "already_completed")
        XCTAssertEqual(env["NEST_QA_CHORE_COMPLETED_BY"], "e5f80cfd-b69a-4aa0-a267-75784e943676")
        XCTAssertEqual(env["NEST_QA_CHORE_COMPLETED_ON"], "2026-10-05")
        XCTAssertEqual(env["NEST_QA_ACTOR"], "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        XCTAssertEqual(env["NEST_QA_HOUSEHOLD"], "be772ffd-3ab5-41d5-8438-647a79a553da")
        XCTAssertEqual(env["NEST_QA_INITIAL_APPEARANCE"], "light")
        XCTAssertEqual(env["NEST_QA_INITIAL_CONTENT_SIZE"], "large")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
    }

    private func openOwnerHistory(_ app: XCUIApplication, reading: AssistantFinancialHistoryMaximumReading) throws {
        let today = app.tabBars.firstMatch.buttons["Today"]
        try reading.requireTarget(today, bounds: app.frame)
        today.tap()
        let profile = app.buttons["tab-profile-action"]
        try reading.requireTarget(profile)
        profile.tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 20))
        let back = app.navigationBars.buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
        let history = app.tabBars.buttons["Ask Nest"]
        try reading.requireTarget(history)
        history.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 20))
    }

    private func restoreToday(_ app: XCUIApplication, reading: AssistantFinancialHistoryMaximumReading) throws {
        let known = ["Scheduled chores", "Conversation", "Ask Nest", "Profile"]
        for _ in 0..<4 {
            let navigation = app.navigationBars.firstMatch
            if !navigation.exists { break }
            XCTAssertTrue(known.contains(navigation.identifier))
            let back = navigation.buttons.element(boundBy: 0)
            try reading.requireTarget(back, bounds: navigation.frame)
            back.tap()
        }
        let today = app.tabBars.firstMatch.buttons["Today"]
        try reading.requireTarget(today, bounds: app.tabBars.firstMatch.frame)
        today.tap()
        XCTAssertTrue(today.isSelected)
    }

    private func assertAcknowledgment(_ reading: AssistantFinancialHistoryMaximumReading) throws {
        try reading.read("Recorded completion")
        try reading.read("This occurrence was already completed.")
        try reading.read("By Test Sam · 2026-10-05")
        try reading.read(explanation)
    }

    private func pullToRefresh(_ app: XCUIApplication, reading: AssistantFinancialHistoryMaximumReading) throws {
        let heading = reading.element("Recorded completion")
        try reading.reveal(heading)
        let bounds = try reading.viewport()
        XCTAssertTrue(finite(bounds) && finite(heading.frame))
        XCTAssertTrue(bounds.contains(heading.frame))
        XCTAssertLessThanOrEqual(heading.frame.minY, bounds.minY + 100, "Refresh requires the measured list beginning")
        let actions = app.buttons.allElementsBoundByIndex.filter { $0.exists }.map(\.frame).filter {
            finite($0) && $0.intersects(bounds)
        }
        let x = min(bounds.minX + 24, (actions.map(\.minX).min() ?? bounds.maxX) - 4)
        let start = CGPoint(x: x, y: bounds.minY + 60)
        let end = CGPoint(x: x, y: min(bounds.maxY - 20, bounds.minY + 260))
        XCTAssertGreaterThanOrEqual(x, bounds.minX + 4)
        XCTAssertTrue(start.x.isFinite && start.y.isFinite && end.x.isFinite && end.y.isFinite)
        XCTAssertTrue(bounds.contains(start) && bounds.contains(end))
        let observations = refreshGeometry(app, start: start, end: end, actions: actions)
        attach(
            [
                "heading": values(heading.frame), "viewport": values(bounds), "geometry": observations,
                "start": [x, start.y], "end": [x, end.y],
                "gestureRequestsRefreshOnly": true, "wireGETObservedByThisAttachment": false,
            ], name: "Measured current-work pull-to-refresh before gesture")
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(
            forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
        XCTAssertTrue(app.navigationBars["Scheduled chores"].exists)
    }

    private func refreshGeometry(
        _ app: XCUIApplication, start: CGPoint, end: CGPoint, actions: [CGRect]
    ) -> [String: Any] {
        let scrollers = (app.scrollViews.allElementsBoundByIndex + app.collectionViews.allElementsBoundByIndex)
            .filter { $0.exists }.map(\.frame).filter { finite($0) && $0.contains(start) && $0.contains(end) }
        XCTAssertEqual(scrollers.count, 1, "Exactly one measured current-work foreground scroller")
        let bars = app.otherElements.allElementsBoundByIndex.filter {
            $0.exists && $0.label.hasPrefix("Vertical scroll bar")
        }.map(\.frame)
        for frame in bars {
            XCTAssertTrue(finite(frame))
            XCTAssertFalse(frame.contains(start) || frame.contains(end))
        }
        for frame in actions { XCTAssertLessThan(start.x, frame.minX) }
        return ["scrollers": scrollers.map(values), "actions": actions.map(values), "bars": bars.map(values)]
    }

    private func finite(_ frame: CGRect) -> Bool {
        [frame.minX, frame.minY, frame.width, frame.height, frame.maxX, frame.maxY, frame.midX, frame.midY]
            .allSatisfy(\.isFinite) && !frame.isNull && !frame.isInfinite && frame.width > 0 && frame.height > 0
    }

    private func values(_ frame: CGRect) -> [Double] {
        XCTAssertTrue(finite(frame))
        return [frame.minX, frame.minY, frame.width, frame.height].map(Double.init)
    }

    private func attach(_ value: [String: Any], name: String) {
        guard JSONSerialization.isValidJSONObject(value) else {
            let item = XCTAttachment(string: String(reflecting: value))
            item.name = name + " invalid diagnostic"
            item.lifetime = .keepAlways
            add(item)
            XCTFail("Nonfinite/invalid refresh diagnostic; no gesture accepted")
            return
        }
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
            let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            item.name = name
            item.lifetime = .keepAlways
            add(item)
        }
    }
}
