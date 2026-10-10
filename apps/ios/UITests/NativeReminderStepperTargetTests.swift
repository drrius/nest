import XCTest

@MainActor
final class NativeReminderStepperTargetTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOriginalChoreStepperEffectiveFortyFourPointEdges() throws {
        try authorized()
        let app = openScheduledChore()
        defer { discardAndRestore(app) }
        openReminder(app)
        assertDisabledCanonicalChoices(app)
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app, missingDistance: -180)
        XCTAssertEqual(toggle.value as? String, "0")
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 10), .completed)
        for (action, offset, initial, expected) in [
            ("Increment", -21.0, 0, 1), ("Increment", 21.0, 1, 2),
            ("Decrement", -21.0, 2, 1), ("Decrement", 21.0, 1, 0),
        ] {
            probe(app, action: action, offset: offset, initial: initial, expected: expected)
        }
        capture(app, name: "All four adjustment edges changed unsent values and returned to zero")
        app.navigationBars["Chore reminder"].buttons["Back"].tap()
        choose("Discard choices", in: app, name: "Explicit Back Discard after successful edges")
        requireDismissed(app)
        openReminder(app)
        assertDisabledCanonicalChoices(app)
        capture(app, name: "Reopened canonical disabled reminder with zero lead time")
        app.navigationBars["Chore reminder"].buttons["Back"].tap()
        requireDismissed(app)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        restoreToday(app)
    }

    private func assertDisabledCanonicalChoices(_ app: XCUIApplication) {
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app)
        XCTAssertEqual(toggle.value as? String, "0")
        for name in ["Remind me", "Remind Test Sam"] {
            let person = app.switches[name]
            reveal(person, in: app, permitsDisabled: true)
            XCTAssertTrue(person.exists)
            XCTAssertFalse(person.isEnabled)
            XCTAssertEqual(person.value as? String, "0")
        }
        let lead = app.staticTexts["reminder-lead-value"]
        reveal(lead, in: app, permitsDisabled: true)
        XCTAssertEqual(lead.label, "Days before: 0")
        for name in ["Decrease days before", "Increase days before"] {
            XCTAssertTrue(app.buttons[name].exists)
            XCTAssertFalse(app.buttons[name].isEnabled)
        }
    }

    private func probe(_ app: XCUIApplication, action: String, offset: Double, initial: Int, expected: Int) {
        let lead = app.staticTexts["reminder-lead-value"]
        reveal(lead, in: app, permitsDisabled: true)
        XCTAssertEqual(lead.label, "Days before: \(initial)")
        if initial == 0 {
            XCTAssertTrue(app.buttons["Decrease days before"].exists)
            XCTAssertFalse(app.buttons["Decrease days before"].isEnabled)
        }
        let button = app.buttons[action == "Increment" ? "Increase days before" : "Decrease days before"]
        XCTAssertTrue(button.exists && button.isEnabled && button.isHittable)
        XCTAssertEqual(button.value as? String, "\(initial) days")
        let row = app.collectionViews.cells.containing(.staticText, identifier: "reminder-lead-value").firstMatch
        XCTAssertTrue(row.exists)
        let frame = button.frame
        let point = CGPoint(x: frame.midX, y: frame.midY + offset)
        let area = CGRect(x: frame.midX - 22, y: frame.midY - 22, width: 44, height: 44)
        let top = app.navigationBars["Chore reminder"].frame.maxY
        let bottom = app.tabBars.firstMatch.frame.minY - 8
        let visible = CGRect(x: 0, y: top, width: app.frame.width, height: bottom - top)
        let record: [String: Any] = [
            "action": action, "offsetFromCenterY": offset, "initial": initial, "expected": expected,
            "button": rect(frame), "row": rect(row.frame), "stepper": rect(lead.frame),
            "point": [point.x, point.y], "effectiveAreaToProbe": rect(area), "viewport": rect(visible),
        ]
        attach(record, name: "Exact Stepper edge before tap")
        capture(app, name: "Stepper \(action) \(offset)pt before edge tap")
        XCTAssertTrue(visible.contains(area), "Entire44pt probe area must be above navigation and tab chrome")
        XCTAssertTrue(row.frame.contains(area), "Probe must stay within the actual native Form row")
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x, dy: point.y)).tap()
        let changed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "label == %@", "Days before: \(expected)"), object: lead)
        let result = XCTWaiter.wait(for: [changed], timeout: 5)
        capture(app, name: "Stepper \(action) \(offset)pt actual edge result")
        attach(
            [
                "changed": result == .completed, "actualValue": lead.label,
                "buttonValue": button.value as? String ?? "missing",
            ],
            name: "Exact Stepper edge observed value")
        XCTAssertEqual(result, .completed, "Stop at the first edge that does not change the unsent value")
        XCTAssertEqual(button.value as? String, "\(expected) days")
    }

    private func discardAndRestore(_ app: XCUIApplication) {
        if app.navigationBars["Chore reminder"].exists {
            app.navigationBars["Chore reminder"].buttons["Back"].tap()
            if app.alerts["Discard changes?"].waitForExistence(timeout: 3) {
                choose("Discard choices", in: app, name: "Explicitly discarded unsent Stepper draft")
            }
            requireDismissed(app)
        }
        restoreToday(app)
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_STEPPER_TARGETS"] == "20261006" else {
                throw XCTSkip("Requires dated read-only native Stepper target proof.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_CHORE_OCCURRENCE_ID"], "ce88cf42-4359-41d4-ab06-a7185c22306b")
            XCTAssertEqual(env["NEST_QA_CHORE_REMINDER_NAME"], "Test Alex")
            XCTAssertTrue(["normal_light", "maximum_dark"].contains(env["NEST_QA_CHORE_REMINDER_PROFILE"] ?? ""))
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Native fictional Stepper proof is forbidden on physical phones.")
        #endif
    }

    private func openScheduledChore() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let manage = app.buttons["Manage chores"]
        reveal(manage, in: app)
        manage.tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        let scheduled = app.buttons["Scheduled chores"]
        reveal(scheduled, in: app)
        scheduled.tap()
        XCTAssertTrue(app.navigationBars["Scheduled chores"].waitForExistence(timeout: 15))
        let matches = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Hosted smoke tidy kitchen"))
        XCTAssertEqual(matches.count, 1)
        let original = matches.firstMatch
        reveal(original, in: app)
        original.tap()
        XCTAssertTrue(app.navigationBars["Scheduled chore"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Currently due 2026-09-28"].exists)
        return app
    }

    private func openReminder(_ app: XCUIApplication) {
        XCTAssertFalse(app.navigationBars["Chore reminder"].exists)
        let choices = app.buttons["Reminder choices"]
        reveal(choices, in: app)
        XCTAssertTrue(choices.isEnabled && choices.isHittable)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Chore reminder"].waitForExistence(timeout: 15))
        waitReady(app)
        XCTAssertTrue(app.staticTexts["Hosted smoke tidy kitchen"].exists)
        XCTAssertTrue(app.staticTexts["Due 2026-09-28"].exists)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
    }

    private func waitReady(_ app: XCUIApplication) {
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: app.navigationBars["Chore reminder"].buttons["Back"])
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func choose(_ title: String, in app: XCUIApplication, name: String) {
        let alert = app.alerts["Discard changes?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        capture(app, name: name)
        let visible = app.frame.intersection(alert.frame)
        var frames: [[String: Any]] = []
        for label in ["Keep editing", "Discard choices"] {
            let button = alert.buttons[label]
            XCTAssertTrue(button.exists)
            frames.append(["label": label, "frame": rect(button.frame)])
        }
        attach(
            ["app": rect(app.frame), "alert": rect(alert.frame), "choices": frames], name: name + " complete frames")
        for label in ["Keep editing", "Discard choices"] {
            let button = alert.buttons[label]
            XCTAssertTrue(button.isEnabled && button.isHittable)
            XCTAssertTrue(visible.contains(button.frame), "Complete action frame must fit the opening alert")
            XCTAssertGreaterThanOrEqual(button.frame.width, 44 - 0.001)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44 - 0.001)
        }
        alert.buttons[title].tap()
        XCTAssertFalse(alert.exists)
    }

    private func requireDismissed(_ app: XCUIApplication) {
        let gone = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Chore reminder"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
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
                attach(frames, name: "Measured actual chore reminder control viewport")
                return
            }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(frames, name: "Failed chore reminder control viewport")
        capture(app, name: "Chore reminder control placement failure")
        XCTFail("Required control must be fully visible")
    }

    private func restoreToday(_ app: XCUIApplication) {
        for title in ["Scheduled chore", "Scheduled chores", "Household chores"] {
            if app.navigationBars[title].exists { app.navigationBars[title].buttons.element(boundBy: 0).tap() }
        }
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
