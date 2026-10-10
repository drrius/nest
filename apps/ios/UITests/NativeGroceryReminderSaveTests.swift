import XCTest

@MainActor
final class NativeGroceryReminderSaveTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testEnableBothRecipientsOnceAndLeaveRecordedRequest() throws {
        try authorized("enable")
        let app = openEditor()
        XCTAssertFalse(app.buttons["Done"].exists)
        assertSettings(app, enabled: "0", recipients: "0")
        selectTomorrow(app)
        flip(app.switches["Reminder enabled"], from: "0", in: app)
        flip(app.switches["Remind me"], from: "0", in: app)
        flip(app.switches["Remind Test Sam"], from: "0", in: app)
        assertSettings(app, enabled: "1", recipients: "1")
        assertDateAndTime(app)
        capture(app, name: "Exact tomorrow 08 both recipients before the one enable Save")
        saveOnce(app, name: "Enabled both recipients recorded before Done")
    }

    func testDisableOwnedReminderOnceAndLeaveRecordedRequest() throws {
        try authorized("disable")
        XCTAssertNotNil(
            UUID(uuidString: ProcessInfo.processInfo.environment["NEST_QA_REMINDER_EXPECTED_REVISION"] ?? ""))
        let app = openEditor()
        XCTAssertFalse(app.buttons["Done"].exists)
        assertSettings(app, enabled: "1", recipients: "1")
        assertDateAndTime(app)
        flip(app.switches["Reminder enabled"], from: "1", in: app)
        assertSettings(app, enabled: "0", recipients: "1")
        assertDateAndTime(app)
        capture(app, name: "Only enabled changed to off before the one disable Save")
        saveOnce(app, name: "Disabled reminder recorded before Done")
    }

    func testFinishExactRecordedRequestThroughDone() throws {
        let phase = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_REMINDER_SAVE_ACTION"])
        XCTAssertTrue(["finish_enabled", "finish_disabled"].contains(phase))
        try authorized(phase)
        XCTAssertNotNil(UUID(uuidString: ProcessInfo.processInfo.environment["NEST_QA_REMINDER_OPERATION"] ?? ""))
        let app = openEditor()
        requireRecorded(app)
        capture(app, name: "Exact recorded local request before normal Done")
        let done = app.buttons["Done"]
        reveal(done, in: app)
        XCTAssertTrue(done.isEnabled && done.isHittable)
        done.tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: done)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 30), .completed)
        let enabled = phase == "finish_enabled" ? "1" : "0"
        assertSettings(app, enabled: enabled, recipients: "1")
        assertDateAndTime(app)
        capture(app, name: "Done clears the exact local request and reloads retained canonical reminder")
        app.navigationBars["Grocery reminder"].buttons["Back"].tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
        restoreToday(app)
    }

    private func saveOnce(_ app: XCUIApplication, name: String) {
        let save = app.buttons["Save reminder"]
        reveal(save, in: app)
        XCTAssertTrue(save.isEnabled && save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(save.frame.height, 44 - 0.001)
        capture(app, name: name + " deliberate Save target")
        save.tap()
        requireRecorded(app)
        capture(app, name: name)
    }

    private func requireRecorded(_ app: XCUIApplication) {
        let confirmed = app.staticTexts["Reminder choices saved. This does not confirm delivery."]
        _ = confirmed.waitForExistence(timeout: 30)
        reveal(confirmed, in: app, permitsDisabled: true, missingDistance: -180)
        XCTAssertTrue(app.staticTexts["2026-10-07 · 08:00 Europe/Zurich"].exists)
        XCTAssertTrue(app.staticTexts["For you"].exists)
        XCTAssertTrue(app.staticTexts["For Test Sam"].exists)
        XCTAssertTrue(app.buttons["Done"].exists)
    }

    private func selectTomorrow(_ app: XCUIApplication) {
        let picker = app.datePickers.firstMatch
        reveal(picker, in: app)
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, "Oct 6, 2026")
        XCTAssertTrue(picker.isEnabled && picker.isHittable)
        picker.tap()
        capture(app, name: "Real native calendar before tomorrow selection")
        let day = app.buttons["Wednesday, October 7"]
        XCTAssertTrue(day.waitForExistence(timeout: 15))
        XCTAssertTrue(day.isEnabled && day.isHittable)
        day.tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.8)).tap()
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, "Oct 7, 2026")
        capture(app, name: "Native calendar exact tomorrow selected without Save")
    }

    private func assertDateAndTime(_ app: XCUIApplication) {
        let date = app.datePickers.firstMatch.buttons["Date Picker"]
        reveal(date, in: app)
        XCTAssertEqual(date.value as? String, "Oct 7, 2026")
        let time = app.buttons["Time Picker"]
        reveal(time, in: app, permitsDisabled: true)
        let value = (time.value as? String)?.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        XCTAssertEqual(value, "8:00 AM")
    }

    private func assertSettings(_ app: XCUIApplication, enabled: String, recipients: String) {
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app, permitsDisabled: true)
        XCTAssertEqual(toggle.value as? String, enabled)
        for label in ["Remind me", "Remind Test Sam"] {
            let person = app.switches[label]
            reveal(person, in: app, permitsDisabled: enabled == "0")
            XCTAssertEqual(person.value as? String, recipients)
            XCTAssertEqual(person.isEnabled, enabled == "1")
        }
    }

    private func flip(_ toggle: XCUIElement, from initial: String, in app: XCUIApplication) {
        reveal(toggle, in: app)
        XCTAssertEqual(toggle.value as? String, initial)
        XCTAssertTrue(toggle.isEnabled && toggle.isHittable)
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", initial), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
    }

    private func openEditor() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let groceries = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Groceries")).firstMatch
        reveal(groceries, in: app)
        groceries.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "QA rice").count, 1)
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
        app.buttons["QA rice"].press(forDuration: 1.0)
        XCTAssertTrue(app.buttons["Reminder choices"].waitForExistence(timeout: 15))
        app.buttons["Reminder choices"].tap()
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: app.navigationBars["Grocery reminder"].buttons["Back"])
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
        return app
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false, missingDistance: CGFloat = 250
    ) {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let editing = app.navigationBars["Grocery reminder"].exists
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            let bounds = lists.first(where: { $0.isHittable })?.frame ?? app.frame
            let top = editing ? app.navigationBars["Grocery reminder"].frame.maxY + 8 : 80
            let bottom = editing ? bounds.maxY - 8 : app.tabBars.firstMatch.frame.minY - 8
            let start = CGPoint(x: app.frame.width * 0.04, y: app.frame.height * 0.65)
            XCTAssertTrue(bounds.contains(start))
            let exists = element.exists
            let frame = exists ? element.frame : .zero
            let hittable = exists && element.isHittable
            frames.append([
                "frame": rect(frame), "exists": exists, "top": top, "bottom": bottom,
                "gestureStart": [start.x, start.y], "missingDirection": missingDistance,
            ])
            if exists && (hittable || permitsDisabled) && frame.minY >= top && frame.maxY <= bottom {
                attach(frames, name: "Measured native reminder control viewport")
                return
            }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(frames, name: "Failed native reminder control viewport")
        capture(app, name: "Native reminder control could not be fully revealed")
        XCTFail("Required control not fully visible; no further action")
    }

    private func authorized(_ action: String) throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_GROCERY_REMINDER_SAVE"] == "20261006" else {
                throw XCTSkip("Requires the dated two-command exact owned grocery reminder fixture.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_REMINDER_SAVE_ACTION"], action)
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ID"], "d24cc35d-a6ae-44c6-9780-e28f8723d44d")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            let formatter = DateFormatter()
            formatter.timeZone = TimeZone(identifier: "Europe/Zurich")
            formatter.dateFormat = "yyyy-MM-dd"
            XCTAssertEqual(formatter.string(from: .now), "2026-10-06")
        #else
            throw XCTSkip("Fictional reminder writes are forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        app.navigationBars["Groceries"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Restored Today top original filter after normal Done")
    }

    private func rect(_ frame: CGRect) -> [CGFloat] { [frame.minX, frame.minY, frame.width, frame.height] }
    private func attach(_ value: Any, name: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
    private func capture(_ app: XCUIApplication, name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
}
