import XCTest

@MainActor
final class NativeGroceryReminderNavigationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testUntouchedOwnedRiceReminderBackTargetAndNavigation() throws {
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
        let more = app.buttons["QA rice"]
        reveal(more, in: app)
        more.press(forDuration: 1.0)
        let reminder = app.buttons["Reminder choices"]
        XCTAssertTrue(reminder.waitForExistence(timeout: 15))
        reminder.tap()
        XCTAssertTrue(app.navigationBars["Grocery reminder"].waitForExistence(timeout: 15))
        let back = app.navigationBars["Grocery reminder"].buttons["Back"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: back)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        XCTAssertTrue(app.staticTexts["QA rice"].exists)
        XCTAssertTrue(app.staticTexts["Choose the date and time to be reminded about this item."].isHittable)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
        capture(app, name: "Untouched real owned Rice reminder choices")
        let frame: [String: Any] = [
            "label": back.label, "frame": [back.frame.minX, back.frame.minY, back.frame.width, back.frame.height],
            "hittable": back.isHittable, "enabled": back.isEnabled, "minimumTarget": 44,
        ]
        attach(frame, name: "Actual Grocery reminder Back toolbar target")
        continueAfterFailure = true
        XCTAssertTrue(back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.width, 44)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44)
        back.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Discard choices"].exists)
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
        capture(app, name: "Untouched Back returned to unchanged groceries")
    }

    func testUnsentChoicesKeepEditingDiscardAndRefreshAfterBackFix() throws {
        try authorized()
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_GROCERY_REMINDER_ACTION"], "unsent_choices")
        XCTAssertTrue(
            ["normal_light", "maximum_dark"].contains(
                ProcessInfo.processInfo.environment["NEST_QA_GROCERY_REMINDER_PROFILE"] ?? ""))
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
        openEditor(app)
        assertChoices(app, enabled: "0", recipient: "0")
        let back = app.navigationBars["Grocery reminder"].buttons["Back"]
        XCTAssertEqual(back.label, "Back")
        XCTAssertTrue(back.isHittable)
        attach(
            [
                "frame": [back.frame.minX, back.frame.minY, back.frame.width, back.frame.height],
                "edgeTapInset": 2, "edgeY": "center", "minimumTarget": 44, "measurementTolerance": 0.001,
            ], name: "Fixed Back frame and visible left edge tap")
        capture(app, name: "Fixed Back and untouched canonical reminder choices")
        XCTAssertGreaterThanOrEqual(back.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44 - 0.001)
        let alreadyVerified = ProcessInfo.processInfo.environment["NEST_QA_GROCERY_REMINDER_EDGE_PROVEN"] == "true"
        if alreadyVerified {
            XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_GROCERY_REMINDER_PROFILE"], "normal_light")
        }
        if !alreadyVerified {
            back.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 2, dy: 0)).tap()
            requireEditorDismissed(app)
            XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
            XCTAssertFalse(app.buttons["Discard choices"].exists)
            openEditor(app)
        }
        makeUnsentChoices(app)
        back.tap()
        choose("Keep editing", in: app, name: "Back offers explicit Keep editing")
        assertChoices(app, enabled: "1", recipient: "1")
        capture(app, name: "Back Keep editing retains local choices")
        back.tap()
        choose("Discard choices", in: app, name: "Back explicitly discards unsent choices")
        requireEditorDismissed(app)
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        openEditor(app)
        assertChoices(app, enabled: "0", recipient: "0")
        capture(app, name: "Reopened editor matches unchanged canonical baseline")
        makeUnsentChoices(app)
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        refresh.tap()
        choose("Keep editing", in: app, name: "Refresh offers explicit Keep editing")
        assertChoices(app, enabled: "1", recipient: "1", fromLowerSection: true)
        capture(app, name: "Refresh Keep editing retains local choices")
        reveal(refresh, in: app)
        refresh.tap()
        choose("Discard choices", in: app, name: "Refresh explicitly discards before read-only reload")
        assertChoices(app, enabled: "0", recipient: "0")
        capture(app, name: "Refresh discard reload matches canonical baseline")
        back.tap()
        requireEditorDismissed(app)
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
    }

    func testMaximumRefreshKeepAndDiscardSuffixRecovery() throws {
        try authorized()
        let env = ProcessInfo.processInfo.environment
        XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ACTION"], "refresh_suffix")
        XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_PROFILE"], "maximum_dark")
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
        openEditor(app)
        assertChoices(app, enabled: "0", recipient: "0")
        makeUnsentChoices(app)
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        refresh.tap()
        choose("Keep editing", in: app, name: "MAX suffix Refresh offers Keep editing")
        assertChoices(app, enabled: "1", recipient: "1", fromLowerSection: true)
        capture(app, name: "MAX suffix Refresh Keep editing retains local choices")
        reveal(refresh, in: app)
        refresh.tap()
        choose("Discard choices", in: app, name: "MAX suffix Refresh discards before read-only reload")
        assertChoices(app, enabled: "0", recipient: "0")
        capture(app, name: "MAX suffix Refresh discard reload matches canonical baseline")
        app.navigationBars["Grocery reminder"].buttons["Back"].tap()
        requireEditorDismissed(app)
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
    }

    private func requireEditorDismissed(_ app: XCUIApplication) {
        let absent = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Grocery reminder"])
        XCTAssertEqual(XCTWaiter.wait(for: [absent], timeout: 15), .completed)
    }

    private func openEditor(_ app: XCUIApplication) {
        XCTAssertFalse(app.navigationBars["Grocery reminder"].exists)
        let more = app.buttons["QA rice"]
        reveal(more, in: app)
        XCTAssertEqual(app.buttons.matching(identifier: "QA rice").count, 1)
        XCTAssertEqual(app.buttons["QA rice"].value as? String, "100 g, To pick up")
        more.press(forDuration: 1.0)
        XCTAssertTrue(app.buttons["Reminder choices"].waitForExistence(timeout: 15))
        app.buttons["Reminder choices"].tap()
        XCTAssertTrue(app.navigationBars["Grocery reminder"].waitForExistence(timeout: 15))
        let back = app.navigationBars["Grocery reminder"].buttons["Back"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: back)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        XCTAssertTrue(app.staticTexts["QA rice"].exists)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
    }

    private func makeUnsentChoices(_ app: XCUIApplication) {
        let enabled = app.switches["Reminder enabled"]
        reveal(enabled, in: app)
        XCTAssertEqual(enabled.value as? String, "0")
        flip(enabled, from: "0")
        let recipient = app.switches["Remind me"]
        reveal(recipient, in: app)
        XCTAssertEqual(recipient.value as? String, "0")
        flip(recipient, from: "0")
        assertChoices(app, enabled: "1", recipient: "1")
    }

    private func flip(_ toggle: XCUIElement, from initial: String) {
        XCTAssertTrue(toggle.isEnabled)
        XCTAssertTrue(toggle.isHittable)
        attach(
            [
                "label": toggle.label,
                "frame": [toggle.frame.minX, toggle.frame.minY, toggle.frame.width, toggle.frame.height],
                "initialValue": initial, "normalizedTap": [0.93, 0.5],
            ], name: "Native reminder switch thumb target")
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", initial), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
    }

    private func assertChoices(
        _ app: XCUIApplication, enabled: String, recipient: String, fromLowerSection: Bool = false
    ) {
        let back = app.navigationBars["Grocery reminder"].buttons["Back"]
        let idle = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: back)
        XCTAssertEqual(XCTWaiter.wait(for: [idle], timeout: 30), .completed)
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app, missingDistance: fromLowerSection ? -180 : 250)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", enabled), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        let person = app.switches["Remind me"]
        XCTAssertTrue(person.exists)
        reveal(person, in: app, permitsDisabled: enabled == "0")
        XCTAssertEqual(person.value as? String, recipient)
        XCTAssertEqual(person.isEnabled, enabled == "1")
    }

    private func choose(_ title: String, in app: XCUIApplication, name: String) {
        capture(app, name: name)
        XCTAssertTrue(app.buttons[title].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Discard changes?"].exists)
        app.buttons[title].tap()
        XCTAssertFalse(app.buttons["Discard choices"].exists)
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_GROCERY_REMINDER_UI"] == "20261006" else {
                throw XCTSkip("Requires the dated read-only owned grocery reminder UI baseline.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ID"], "d24cc35d-a6ae-44c6-9780-e28f8723d44d")
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional grocery reminder UI is forbidden on physical phones.")
        #endif
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false, missingDistance: CGFloat = 250
    ) {
        var observations: [[String: Any]] = []
        for _ in 0..<24 {
            let editing = app.navigationBars["Grocery reminder"].exists
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            let top = editing ? app.navigationBars["Grocery reminder"].frame.maxY + 8 : 80
            let bottom =
                editing
                ? (lists.first(where: { $0.isHittable })?.frame.maxY ?? app.frame.maxY) - 8
                : app.tabBars.firstMatch.frame.minY - 8
            let bounds = lists.first(where: { $0.isHittable })?.frame ?? app.frame
            let startPoint = CGPoint(
                x: app.frame.minX + app.frame.width * 0.04, y: app.frame.minY + app.frame.height * 0.65)
            XCTAssertTrue(bounds.contains(startPoint))
            let state = snapshot(element)
            let frame = state.frame
            observations.append([
                "frame": [frame.minX, frame.minY, frame.width, frame.height],
                "top": top, "bottom": bottom, "exists": state.exists,
                "hittable": state.hittable, "enabled": state.enabled,
                "scrollContainer": [bounds.minX, bounds.minY, bounds.width, bounds.height],
                "gestureStart": [startPoint.x, startPoint.y], "missingElementDirection": missingDistance,
            ])
            if state.exists && (state.hittable || permitsDisabled) && frame.minY >= top && frame.maxY <= bottom {
                attach(observations, name: "Measured reminder control full viewport")
                return
            }
            if frame.isEmpty {
                dragGutter(missingDistance, in: app)
                continue
            }
            let delta = frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20
            let distance = max(-180, min(250, delta))
            dragGutter(distance, in: app)
        }
        attach(observations, name: "Measured unsuccessful reminder control placement")
        capture(app, name: "Required reminder control placement failed")
        XCTFail("Required read-only reminder control could not be fully revealed")
    }

    private func dragGutter(_ distance: CGFloat, in app: XCUIApplication) {
        let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
        let destination = app.coordinate(
            withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
        origin.press(forDuration: 0.1, thenDragTo: destination, withVelocity: .slow, thenHoldForDuration: 0.2)
    }

    private func snapshot(_ element: XCUIElement) -> (exists: Bool, frame: CGRect, hittable: Bool, enabled: Bool) {
        guard element.exists else { return (false, .zero, false, false) }
        return (true, element.frame, element.isHittable, element.isEnabled)
    }

    private func restoreToday(_ app: XCUIApplication) {
        if app.navigationBars["Grocery reminder"].exists {
            app.navigationBars["Grocery reminder"].buttons["Back"].tap()
            if app.buttons["Discard choices"].waitForExistence(timeout: 2) {
                app.buttons["Discard choices"].tap()
            }
        }
        if app.navigationBars["Groceries"].exists {
            app.navigationBars["Groceries"].buttons.element(boundBy: 0).tap()
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable
                && app.staticTexts["Today"].firstMatch.frame.minY >= 40
                && app.staticTexts["Today"].firstMatch.frame.minY < 180
            {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        capture(app, name: "Restored original Today top and selected filter")
    }

    private func attach(_ value: Any, name: String) {
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
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
