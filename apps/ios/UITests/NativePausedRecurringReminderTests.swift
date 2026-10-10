import XCTest

@MainActor
final class NativePausedRecurringReminderTests: XCTestCase {
    private let title = "Synthetic native manual-link QA"
    private let explanation = "Only an active rule with a next due date can save reminder choices."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOriginalPausedRuleTruthfulReadOnlyReminderRefusal() throws {
        try authorized()
        let app = openRule()
        openReminder(app)
        assertInactive(app)
        capture(app, name: "Original paused rule refuses reminder changes")
        closeReminder(app, name: "Untouched paused reminder Back")
        openReminder(app)
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        XCTAssertTrue(refresh.isEnabled && refresh.isHittable)
        capture(app, name: "Paused rule read-only Refresh choices")
        refresh.tap()
        waitReady(app)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        assertInactive(app, fromLowerSection: true)
        capture(app, name: "Fresh paused context retains disabled defaults")
        closeReminder(app, name: "Refreshed paused reminder untouched Back")
        app.navigationBars["Recurring expense"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Recurring expenses"].waitForExistence(timeout: 15))
        app.navigationBars["Recurring expenses"].buttons.element(boundBy: 0).tap()
        restoreToday(app)
    }

    private func openRule() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        if app.staticTexts["Welcome, Test Alex."].exists { app.buttons["Get started"].tap() }
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tabs.buttons["Money"].tap()
        let recurring = app.buttons["Recurring expenses"]
        reveal(recurring, in: app)
        XCTAssertTrue(recurring.isEnabled && recurring.isHittable)
        recurring.tap()
        XCTAssertTrue(app.navigationBars["Recurring expenses"].waitForExistence(timeout: 15))
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
        reveal(row, in: app)
        XCTAssertTrue(row.waitForExistence(timeout: 30))
        XCTAssertTrue(row.isEnabled && row.isHittable)
        if ProcessInfo.processInfo.environment["NEST_QA_PAUSED_RECURRING_PROFILE"] == "maximum_dark" {
            assertReadableRuleMetadata(app, row: row)
        }
        row.tap()
        XCTAssertTrue(app.navigationBars["Recurring expense"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Paused"].waitForExistence(timeout: 30))
        return app
    }

    private func assertReadableRuleMetadata(_ app: XCUIApplication, row: XCUIElement) {
        attach(["frame": rect(row.frame), "label": row.label], name: "Complete paused title and status target")
        capture(app, name: "Whole maximum paused title and status navigation target")
        for label in ["Automatic · CHF 0.03", "Next due 2026-10-11"] {
            let detail = app.staticTexts[label].firstMatch
            reveal(detail, in: app, permitsDisabled: true)
            XCTAssertEqual(detail.label, label)
            attach(["frame": rect(detail.frame), "label": detail.label], name: "Complete paused rule metadata row")
            capture(app, name: "Whole maximum paused rule metadata " + label)
        }
        reveal(row, in: app, missingDistance: -180)
        XCTAssertTrue(row.isEnabled && row.isHittable)
    }

    private func openReminder(_ app: XCUIApplication) {
        let choices = app.buttons["Reminder choices"]
        reveal(choices, in: app)
        XCTAssertTrue(choices.isEnabled && choices.isHittable)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Bill reminder"].waitForExistence(timeout: 15))
        waitReady(app)
        XCTAssertTrue(app.staticTexts[title].exists)
        XCTAssertTrue(app.staticTexts["Next due 2026-10-11"].exists)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
    }

    private func waitReady(_ app: XCUIApplication) {
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: app.navigationBars["Bill reminder"].buttons["Back"])
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func assertInactive(_ app: XCUIApplication, fromLowerSection: Bool = false) {
        let notice = app.staticTexts[explanation]
        reveal(notice, in: app, permitsDisabled: true, missingDistance: fromLowerSection ? -180 : 250)
        capture(app, name: "Whole truthful inactive rule explanation")
        for label in ["Reminder enabled", "Remind me", "Remind Test Sam"] {
            let toggle = app.switches[label]
            reveal(toggle, in: app, permitsDisabled: true)
            XCTAssertFalse(toggle.isEnabled)
            XCTAssertEqual(toggle.value as? String, "0")
            attach(
                [
                    "label": label, "frame": rect(toggle.frame), "enabled": toggle.isEnabled,
                    "value": toggle.value as? String ?? "",
                ], name: "Paused reminder disabled switch")
        }
        let time = app.buttons["Time Picker"]
        reveal(time, in: app, permitsDisabled: true)
        XCTAssertFalse(time.isEnabled)
        let value = (time.value as? String)?.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        XCTAssertEqual(value, "8:00 AM")
        let lead = app.staticTexts["reminder-lead-value"]
        reveal(lead, in: app, permitsDisabled: true)
        XCTAssertEqual(lead.label, "Days before: 0")
        for label in ["Decrease days before", "Increase days before"] {
            let button = app.buttons[label]
            reveal(button, in: app, permitsDisabled: true)
            XCTAssertFalse(button.isEnabled)
            XCTAssertEqual(button.value as? String, "0 days")
        }
        capture(app, name: "Disabled native time and lead controls")
        let save = app.buttons["Save reminder"]
        reveal(save, in: app, permitsDisabled: true)
        XCTAssertFalse(save.isEnabled)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        capture(app, name: "Save reminder unavailable for original paused rule")
    }

    private func closeReminder(_ app: XCUIApplication, name: String) {
        let back = app.navigationBars["Bill reminder"].buttons["Back"]
        XCTAssertTrue(back.exists && back.isEnabled && back.isHittable)
        XCTAssertTrue(app.frame.contains(back.frame))
        XCTAssertTrue(app.navigationBars["Bill reminder"].frame.contains(back.frame))
        XCTAssertGreaterThanOrEqual(back.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44 - 0.001)
        attach(["frame": rect(back.frame), "leftInset": 2, "verticalPoint": "center"], name: name)
        back.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 2, dy: 0)).tap()
        let gone = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Bill reminder"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        XCTAssertTrue(app.navigationBars["Recurring expense"].exists)
        capture(app, name: name + " closes without an unsaved-choice alert")
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_PAUSED_RECURRING_UI"] == "20261006" else {
                throw XCTSkip("Requires dated GET-only original paused reminder refusal verification.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_PAUSED_RECURRING_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_PAUSED_RECURRING_RULE_ID"], "06146b4a-95e5-4227-a562-5aebacceea6d")
            XCTAssertEqual(env["NEST_QA_PAUSED_RECURRING_STATUS"], "paused")
            XCTAssertTrue(["normal_light", "maximum_dark"].contains(env["NEST_QA_PAUSED_RECURRING_PROFILE"] ?? ""))
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional paused reminder UI is forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Restored original Today top and filter")
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false, missingDistance: CGFloat = 250
    ) {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            let bounds = lists.first(where: { $0.isHittable })?.frame ?? app.frame
            let nav = app.navigationBars.allElementsBoundByIndex.first(where: { $0.isHittable })
            let top = nav?.frame.maxY ?? 80
            let bottom = app.tabBars.firstMatch.isHittable ? app.tabBars.firstMatch.frame.minY - 8 : bounds.maxY - 8
            let start = CGPoint(x: app.frame.width * 0.04, y: app.frame.height * 0.65)
            XCTAssertTrue(bounds.contains(start))
            let exists = element.exists
            let frame = exists ? element.frame : .zero
            frames.append([
                "frame": rect(frame), "exists": exists, "top": top, "bottom": bottom,
                "gestureStart": [start.x, start.y], "missingDirection": missingDistance,
            ])
            let usable = exists && (permitsDisabled || element.isHittable)
            if usable && frame.minY >= top && frame.maxY <= bottom {
                attach(frames, name: "Measured actual paused bill reminder control viewport")
                return
            }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(frames, name: "Failed paused bill reminder control viewport")
        capture(app, name: "Meal reminder control placement failure")
        XCTFail("Required control must be fully visible")
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
