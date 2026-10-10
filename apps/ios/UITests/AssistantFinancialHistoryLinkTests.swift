import XCTest

@MainActor
final class AssistantFinancialHistoryLinkTests: XCTestCase {
    private let conversation = "c03d1ecf-b3f6-4145-936f-2122da2c02ff"
    private let approval = "79c71d74-81bc-4b15-b292-d3cb28b18655"
    private let event = "96562f14-7500-4c47-80bf-487705ca02a2"
    private let bill = "Fictional private bill approval 3e7cd25c"
    private let note = "Fictional private approval QA; no payment or actual transfer."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testExistingPrivateBillResultOpensItsRecordedExpense() throws {
        try requireFixture()
        let app = openOwnerHistory()
        let row = app.buttons["assistant-conversation-\(conversation)"]
        reveal(row, in: app)
        capture(row, name: "Exact interrupted private conversation target", in: app)
        requireTarget(row, in: app)
        row.tap()
        XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 20))
        read("Private to you", in: app)
        let proposals = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Record recurring bill"))
        reveal(proposals.firstMatch, in: app)
        XCTAssertEqual(proposals.count, 1, "Only the known conversation's single recorded tool proposal is allowed")
        let proposal = proposals.firstMatch
        capture(proposal, name: "Transcript bill proposal target before navigation", in: app)
        requireTarget(proposal, in: app)
        proposal.tap()
        XCTAssertTrue(app.navigationBars["Review bill"].waitForExistence(timeout: 20))
        assertRecordedBill(in: app)
        let recorded = app.buttons["View recorded expense"]
        reveal(recorded, in: app)
        capture(recorded, name: "Canonical consumed proposal recorded-expense target", in: app)
        requireTarget(recorded, in: app)
        recorded.tap()
        XCTAssertTrue(app.navigationBars["Entry details"].waitForExistence(timeout: 20))
        assertRecordedEntry(in: app)
        back(in: app, from: "Entry details", to: "Review bill")
        back(in: app, from: "Review bill", to: "Conversation")
        back(in: app, from: "Conversation", to: "Ask Nest")
        let back = app.navigationBars["Ask Nest"].buttons.element(boundBy: 0)
        requireTarget(back, in: app)
        back.tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app.buttons["Me + shared"], name: "Returned original Today and filter", in: app)
    }

    func testMaximumPrivateBillResultRemainsReadableThroughRecordedExpense() throws {
        try maximumJourney(marker: "20261006-maximum-dark-one-journey")
    }

    func testMaximumRecordedBillNavigationWithFiniteGeometry() throws {
        try maximumJourney(marker: "20261006-maximum-dark-finite-geometry")
    }

    private func maximumJourney(marker: String) throws {
        try requireFixture()
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_ASSISTANT_BILL_HISTORY_MAXIMUM"], marker)
        XCTAssertEqual(
            ProcessInfo.processInfo.environment["NEST_QA_ASSISTANT_BILL_HISTORY_ACTOR"],
            "791f7261-6c9d-4061-9c8a-57aa6e0b0200")
        XCTAssertEqual(
            ProcessInfo.processInfo.environment["NEST_QA_ASSISTANT_BILL_HISTORY_HOUSEHOLD"],
            "be772ffd-3ab5-41d5-8438-647a79a553da")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self)
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        defer { try? reading.restoreToday() }
        try openMaximumOwnerHistory(reading)
        let row = app.buttons["assistant-conversation-\(conversation)"]
        try reading.reveal(row)
        reading.capture(row, name: "Maximum exact interrupted conversation target")
        try reading.requireTarget(row)
        row.tap()
        XCTAssertTrue(app.navigationBars["Conversation"].waitForExistence(timeout: 20))
        try reading.read("Private to you")
        let proposals = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Record recurring bill"))
        try reading.reveal(proposals.firstMatch)
        XCTAssertEqual(proposals.count, 1)
        reading.capture(proposals.firstMatch, name: "Maximum transcript recorded bill link before tap")
        try reading.requireTarget(proposals.firstMatch)
        proposals.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["Review bill"].waitForExistence(timeout: 20))
        try assertMaximumRecordedBill(reading)
        let recorded = app.buttons["View recorded expense"]
        try reading.reveal(recorded)
        reading.capture(recorded, name: "Maximum canonical recorded expense link before tap")
        try reading.requireTarget(recorded)
        recorded.tap()
        XCTAssertTrue(app.navigationBars["Entry details"].waitForExistence(timeout: 20))
        try assertMaximumRecordedEntry(reading)
        try reading.back(from: "Entry details", to: "Review bill")
        try reading.back(from: "Review bill", to: "Conversation")
        try reading.back(from: "Conversation", to: "Ask Nest")
    }

    private func openMaximumOwnerHistory(_ reading: AssistantFinancialHistoryMaximumReading) throws {
        let app = reading.app
        let today = app.tabBars.firstMatch.buttons["Today"]
        try reading.requireTarget(today, bounds: app.tabBars.firstMatch.frame)
        today.tap()
        let profile = app.buttons["tab-profile-action"]
        try reading.requireTarget(profile)
        profile.tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 20))
        let close = app.navigationBars.firstMatch.buttons.element(boundBy: 0)
        try reading.requireTarget(close, bounds: app.navigationBars.firstMatch.frame)
        close.tap()
        let history = app.tabBars.buttons["Ask Nest"]
        try reading.requireTarget(history)
        history.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 20))
    }

    private func assertMaximumRecordedBill(_ reading: AssistantFinancialHistoryMaximumReading) throws {
        for label in [
            "Bill recorded", bill, "Amount, CHF 0.03", "Payer, You", "You, CHF 0.02",
            "Your partner, CHF 0.01", "Due date, 2026-10-05", "Cycle, 2026-10-01 to 2026-10-31", note,
            "This records one expense. Nest does not pay the bill or change its recurring rule.",
            "Bill recorded. This cycle will not be recorded again by this decision.",
        ] {
            try reading.read(label)
        }
        XCTAssertFalse(reading.app.buttons["Review confirmation"].exists)
        XCTAssertFalse(reading.app.buttons["Decline proposal"].exists)
    }

    private func assertMaximumRecordedEntry(_ reading: AssistantFinancialHistoryMaximumReading) throws {
        for label in [bill, "CHF 0.03", "2026-10-05", "Expense", note] { try reading.read(label) }
        reading.capture(reading.element(note), name: "Maximum recorded expense amount date and note")
        for label in [
            "Recorded shares", "You", "Allocated: CHF 0.02", "Balance change: +CHF 0.01",
            "Your partner", "Allocated: CHF 0.01", "Balance change: −CHF 0.01",
        ] {
            try reading.read(label)
        }
        reading.capture(reading.element("Balance change: −CHF 0.01"), name: "Maximum immutable allocations")
    }

    private func requireFixture() throws {
        _ = try NativeMealWeekFixture(action: "assistant_bill_history_link")
        let values = ProcessInfo.processInfo.environment
        guard values["NEST_QA_ASSISTANT_BILL_HISTORY"] == "20261006" else {
            throw XCTSkip("Requires the explicitly authorized recorded fictional history navigation.")
        }
        XCTAssertEqual(values["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(values["NEST_QA_MANUAL_WEEK_NAME"], "Test Alex")
        XCTAssertEqual(values["NEST_QA_ASSISTANT_CONVERSATION"], conversation)
        XCTAssertEqual(values["NEST_QA_ASSISTANT_APPROVAL"], approval)
        XCTAssertEqual(values["NEST_QA_ASSISTANT_EVENT"], event)
        XCTAssertEqual(values["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(values["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(values["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
        XCTAssertEqual(values["NEST_QA_PUSH_ENABLED"], "false")
    }

    private func openOwnerHistory() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        let profile = app.buttons["tab-profile-action"]
        requireTarget(profile, in: app)
        profile.tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 20))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let history = app.tabBars.buttons["Ask Nest"]
        requireTarget(history, in: app)
        history.tap()
        XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 20))
        return app
    }

    private func assertRecordedBill(in app: XCUIApplication) {
        for label in [
            "Bill recorded", bill, "Amount, CHF 0.03", "Payer, You", "You, CHF 0.02",
            "Your partner, CHF 0.01", "Due date, 2026-10-05", "Cycle, 2026-10-01 to 2026-10-31", note,
            "This records one expense. Nest does not pay the bill or change its recurring rule.",
            "Bill recorded. This cycle will not be recorded again by this decision.",
        ] {
            read(label, in: app)
        }
        XCTAssertFalse(app.buttons["Review confirmation"].exists)
        XCTAssertFalse(app.buttons["Decline proposal"].exists)
    }

    private func assertRecordedEntry(in app: XCUIApplication) {
        for label in [bill, "CHF 0.03", "2026-10-05", "Expense", note] { read(label, in: app) }
        capture(element(note, in: app), name: "Correct recorded expense title amount date and note", in: app)
        for label in [
            "Recorded shares", "You", "Allocated: CHF 0.02", "Balance change: +CHF 0.01",
            "Your partner", "Allocated: CHF 0.01", "Balance change: −CHF 0.01",
        ] {
            read(label, in: app)
        }
        capture(element("Balance change: −CHF 0.01", in: app), name: "Immutable recorded expense shares", in: app)
    }

    private func element(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
    }

    private func read(_ label: String, in app: XCUIApplication) {
        let target = element(label, in: app)
        reveal(target, in: app)
        XCTAssertTrue(target.exists, "Required canonical recorded value: \(label)")
        XCTAssertTrue(viewport(in: app).contains(target.frame), "Complete canonical value must be visible: \(label)")
    }

    private func requireTarget(_ target: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(target.exists && target.isEnabled && target.isHittable)
        XCTAssertTrue(app.frame.contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 1e-9)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 1e-9)
    }

    private func viewport(in app: XCUIApplication) -> CGRect {
        let navigation = app.navigationBars.firstMatch
        let top = navigation.exists ? navigation.frame.maxY : app.frame.minY
        let bottom = app.tabBars.firstMatch.frame.minY
        return CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top)
    }

    private func reveal(_ target: XCUIElement, in app: XCUIApplication) {
        for attempt in 0..<24 {
            let bounds = viewport(in: app)
            let frame = target.exists ? target.frame : .zero
            if target.exists && !frame.isEmpty && bounds.contains(frame) { return }
            let distance = frame.isEmpty ? 250 : max(-180, min(250, frame.midY - bounds.midY))
            let startY = min(bounds.maxY - 12, max(bounds.minY + 12, bounds.midY + 120))
            let endY = min(bounds.maxY - 12, max(bounds.minY + 12, startY - distance))
            let point = app.coordinate(withNormalizedOffset: .zero)
            let x = app.frame.maxX - 4
            let start = point.withOffset(CGVector(dx: x, dy: startY))
            let end = point.withOffset(CGVector(dx: x, dy: endY))
            XCTAssertTrue(bounds.contains(CGPoint(x: x, y: startY)))
            XCTAssertTrue(bounds.contains(CGPoint(x: x, y: endY)))
            attach(
                [
                    "attempt": attempt, "target": target.exists ? target.identifier : "unrealized existing target",
                    "exists": target.exists,
                    "frame": values(frame), "viewport": values(bounds), "start": [x, startY], "end": [x, endY],
                ],
                name: "Measured read-only history reveal")
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        capture(target, name: "Required history target remained outside viewport", in: app)
        XCTFail("Required existing history target is not fully visible")
    }

    private func back(in app: XCUIApplication, from: String, to: String) {
        let target = app.navigationBars[from].buttons.element(boundBy: 0)
        requireTarget(target, in: app)
        target.tap()
        XCTAssertTrue(app.navigationBars[to].waitForExistence(timeout: 15))
    }

    private func capture(_ target: XCUIElement, name: String, in app: XCUIApplication) {
        attach(
            [
                "label": target.exists ? target.label : "", "frame": target.exists ? values(target.frame) : [],
                "exists": target.exists, "enabled": target.exists && target.isEnabled,
                "hittable": target.exists && target.isHittable, "viewport": values(viewport(in: app)),
            ], name: name)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }

    private func values(_ rect: CGRect) -> [Double] {
        [rect.minX, rect.minY, rect.width, rect.height].map(Double.init)
    }

    private func attach(_ payload: [String: Any], name: String) {
        if let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]) {
            let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            item.name = name
            item.lifetime = .keepAlways
            add(item)
        }
    }
}
