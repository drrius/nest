import XCTest

@MainActor
final class NativeReminderAlertReadabilityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testMaximumOwnedGroceryAlertOpensWithBothReadableChoices() throws {
        try authorized()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        defer { restoreToday(app) }
        let groceries = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Groceries")).firstMatch
        reveal(groceries, in: app)
        groceries.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "QA rice").count, 1)
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
        app.buttons["QA rice"].press(forDuration: 1.0)
        XCTAssertTrue(app.buttons["Reminder choices"].waitForExistence(timeout: 15))
        app.buttons["Reminder choices"].tap()
        let back = app.navigationBars["Grocery reminder"].buttons["Back"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: back)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        assertChoices(app, enabled: "0")
        flip(app.switches["Reminder enabled"], in: app)
        flip(app.switches["Remind me"], in: app)
        assertChoices(app, enabled: "1")
        XCTAssertTrue(back.isHittable)
        back.tap()
        assertReadableAlert(app, name: "MAX opening alert has complete Keep and Discard choices")
        app.alerts["Discard changes?"].buttons["Keep editing"].tap()
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        assertChoices(app, enabled: "1")
        capture(app, name: "MAX readable Keep editing retains unsent choices")
        back.tap()
        assertReadableAlert(app, name: "MAX reopened alert has complete Keep and Discard choices")
        app.alerts["Discard changes?"].buttons["Discard choices"].tap()
        let gone = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Grocery reminder"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
    }

    private func assertReadableAlert(_ app: XCUIApplication, name: String) {
        let alert = app.alerts["Discard changes?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        capture(app, name: name)
        let visible = app.frame.intersection(alert.frame)
        var frames: [[String: Any]] = []
        for title in ["Keep editing", "Discard choices"] {
            let button = alert.buttons[title]
            let frame = button.exists ? button.frame : .zero
            frames.append(["label": title, "exists": button.exists, "frame": rect(frame)])
        }
        attach(
            ["app": rect(app.frame), "alert": rect(alert.frame), "visible": rect(visible), "choices": frames],
            name: name + " frames")
        for title in ["Keep editing", "Discard choices"] {
            let button = alert.buttons[title]
            XCTAssertTrue(button.exists)
            XCTAssertEqual(button.label, title)
            XCTAssertTrue(button.isEnabled)
            XCTAssertTrue(button.isHittable)
            let frame = button.frame
            XCTAssertGreaterThanOrEqual(frame.width, 44 - 0.001)
            XCTAssertGreaterThanOrEqual(frame.height, 44 - 0.001)
            XCTAssertTrue(visible.contains(frame), "Complete \(title) frame must fit the opening alert viewport")
        }
    }

    private func assertChoices(_ app: XCUIApplication, enabled: String) {
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app)
        XCTAssertEqual(toggle.value as? String, enabled)
        let person = app.switches["Remind me"]
        reveal(person, in: app, permitsDisabled: enabled == "0")
        XCTAssertEqual(person.value as? String, enabled)
        XCTAssertEqual(person.isEnabled, enabled == "1")
    }

    private func flip(_ toggle: XCUIElement, in app: XCUIApplication) {
        reveal(toggle, in: app)
        XCTAssertEqual(toggle.value as? String, "0")
        XCTAssertTrue(toggle.isEnabled)
        XCTAssertTrue(toggle.isHittable)
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false) {
        var observations: [[String: Any]] = []
        for _ in 0..<24 {
            let editing = app.navigationBars["Grocery reminder"].exists
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            let bounds = lists.first(where: { $0.isHittable })?.frame ?? app.frame
            let top = editing ? app.navigationBars["Grocery reminder"].frame.maxY + 8 : 80
            let bottom = editing ? bounds.maxY - 8 : app.tabBars.firstMatch.frame.minY - 8
            let start = CGPoint(x: app.frame.minX + app.frame.width * 0.04, y: app.frame.minY + app.frame.height * 0.65)
            XCTAssertTrue(bounds.contains(start))
            let state = snapshot(element)
            let frame = state.frame
            observations.append([
                "frame": rect(frame), "exists": state.exists, "hittable": state.hittable,
                "top": top, "bottom": bottom, "gestureStart": [start.x, start.y], "container": rect(bounds),
            ])
            if state.exists && (state.hittable || permitsDisabled) && frame.minY >= top && frame.maxY <= bottom {
                attach(observations, name: "Measured readable control placement")
                return
            }
            let delta = frame.isEmpty ? 250 : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(observations, name: "Failed readable control placement")
        capture(app, name: "Readable control placement failure")
        XCTFail("Required control must have a complete visible frame")
    }

    private func snapshot(_ element: XCUIElement) -> (exists: Bool, frame: CGRect, hittable: Bool) {
        guard element.exists else { return (false, .zero, false) }
        return (true, element.frame, element.isHittable)
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_REMINDER_ALERT_READABLE"] == "20261006" else {
                throw XCTSkip("Requires dated owned maximum-text reminder alert readability.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ID"], "d24cc35d-a6ae-44c6-9780-e28f8723d44d")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_PROFILE"], "maximum_dark")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional reminder readability checks are forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        if app.navigationBars["Groceries"].exists {
            app.navigationBars["Groceries"].buttons.element(boundBy: 0).tap()
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        capture(app, name: "Restored Today top with original filter")
    }

    private func rect(_ frame: CGRect) -> [CGFloat] {
        [frame.minX, frame.minY, frame.width, frame.height]
    }

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
