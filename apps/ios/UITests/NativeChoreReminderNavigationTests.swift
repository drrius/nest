import XCTest

@MainActor
final class NativeChoreReminderNavigationTests: XCTestCase {
    private struct Baseline: Decodable {
        let enabled: Bool
        let recipientIds: [String]
        let localTime: String
        let daysBefore: Int
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOriginalChoreUnsentReminderNavigationAndReadableChoices() throws {
        let baseline = try authorized()
        let app = openScheduledChore()
        defer { restoreToday(app) }
        openReminder(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        let back = app.navigationBars["Chore reminder"].buttons["Back"]
        XCTAssertTrue(back.isEnabled && back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44 - 0.001)
        attach(
            ["frame": rect(back.frame), "leftInset": 2, "verticalPoint": "center"],
            name: "Chore reminder untouched Back target")
        capture(app, name: "Untouched original canonical chore reminder")
        back.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 2, dy: 0)).tap()
        requireDismissed(app)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        openReminder(app)
        flipEnabled(app, initial: baseline.enabled)
        back.tap()
        choose("Keep editing", in: app, name: "Back offers full Keep editing and Discard choices")
        assertSettings(app, baseline: baseline, enabled: !baseline.enabled, fromLowerSection: true)
        capture(app, name: "Back Keep editing retains all unsent chore reminder settings")
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        refresh.tap()
        choose("Keep editing", in: app, name: "Refresh offers full Keep editing and Discard choices")
        assertSettings(app, baseline: baseline, enabled: !baseline.enabled, fromLowerSection: true)
        capture(app, name: "Refresh Keep editing retains all unsent settings")
        reveal(refresh, in: app)
        refresh.tap()
        choose("Discard choices", in: app, name: "Refresh explicit Discard choices before reload")
        waitReady(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        capture(app, name: "Explicit Discard reload restores exact canonical chore reminder settings")
        flipEnabled(app, initial: baseline.enabled)
        back.tap()
        choose("Discard choices", in: app, name: "Back explicit Discard choices exits unsent draft")
        requireDismissed(app)
        XCTAssertTrue(app.navigationBars["Scheduled chore"].waitForExistence(timeout: 15))
        capture(app, name: "Back Discard returned to unchanged scheduled chore")
    }

    func testMaximumChoreReminderUnfinishedRefreshAndDiscardSuffix() throws {
        let baseline = try authorized()
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_CHORE_REMINDER_PROFILE"], "maximum_dark")
        let app = openScheduledChore()
        defer { restoreToday(app) }
        openReminder(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        flipEnabled(app, initial: baseline.enabled)
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        refresh.tap()
        choose("Keep editing", in: app, name: "Maximum suffix Refresh full Keep editing and Discard choices")
        assertSettings(app, baseline: baseline, enabled: !baseline.enabled, fromLowerSection: true)
        capture(app, name: "Maximum suffix Refresh Keep editing retains all unsent settings")
        reveal(refresh, in: app)
        refresh.tap()
        choose("Discard choices", in: app, name: "Maximum suffix Refresh explicit Discard before reload")
        waitReady(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        capture(app, name: "Maximum suffix Discard reload restores canonical settings")
        flipEnabled(app, initial: baseline.enabled)
        app.navigationBars["Chore reminder"].buttons["Back"].tap()
        choose("Discard choices", in: app, name: "Maximum suffix Back explicit Discard exits draft")
        requireDismissed(app)
        XCTAssertTrue(app.navigationBars["Scheduled chore"].waitForExistence(timeout: 15))
        capture(app, name: "Maximum suffix returned to unchanged scheduled chore")
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

    private func assertSettings(
        _ app: XCUIApplication, baseline: Baseline, enabled: Bool, fromLowerSection: Bool = false
    ) {
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app, missingDistance: fromLowerSection ? -180 : 250)
        XCTAssertEqual(toggle.value as? String, enabled ? "1" : "0")
        let actors = [
            "Remind me": "791f7261-6c9d-4061-9c8a-57aa6e0b0200",
            "Remind Test Sam": "e5f80cfd-b69a-4aa0-a267-75784e943676",
        ]
        for (label, actor) in actors.sorted(by: { $0.key < $1.key }) {
            let person = app.switches[label]
            reveal(person, in: app, permitsDisabled: !enabled)
            XCTAssertEqual(
                person.value as? String, baseline.recipientIds.map { $0.lowercased() }.contains(actor) ? "1" : "0")
            XCTAssertEqual(person.isEnabled, enabled)
        }
        let time = app.buttons["Time Picker"]
        reveal(time, in: app, permitsDisabled: !enabled)
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "HH:mm"
        let date = try? XCTUnwrap(formatter.date(from: baseline.localTime))
        XCTAssertNotNil(date)
        formatter.dateFormat = "h:mm a"
        let expected = formatter.string(from: date!)
        let actual = (time.value as? String)?.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
        XCTAssertEqual(actual, expected)
        XCTAssertEqual(time.isEnabled, enabled)
        let lead = app.steppers["Days before: \(baseline.daysBefore)"]
        reveal(lead, in: app, permitsDisabled: true)
        XCTAssertEqual(lead.value as? String, "\(baseline.daysBefore)")
        XCTAssertEqual(lead.isEnabled, enabled)
    }

    private func flipEnabled(_ app: XCUIApplication, initial: Bool) {
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app, missingDistance: -180)
        XCTAssertEqual(toggle.value as? String, initial ? "1" : "0")
        XCTAssertTrue(toggle.isEnabled && toggle.isHittable)
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value != %@", initial ? "1" : "0"), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
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

    private func authorized() throws -> Baseline {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_CHORE_REMINDER_UI"] == "20261006" else {
                throw XCTSkip("Requires dated original chore reminder draft navigation.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_CHORE_OCCURRENCE_ID"], "ce88cf42-4359-41d4-ab06-a7185c22306b")
            XCTAssertEqual(env["NEST_QA_CHORE_REMINDER_NAME"], "Test Alex")
            XCTAssertTrue(["normal_light", "maximum_dark"].contains(env["NEST_QA_CHORE_REMINDER_PROFILE"] ?? ""))
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            let raw = try XCTUnwrap(env["NEST_QA_CHORE_EDITOR_SETTINGS_JSON"])
            return try JSONDecoder().decode(Baseline.self, from: Data(raw.utf8))
        #else
            throw XCTSkip("Fictional chore reminder navigation is forbidden on physical phones.")
        #endif
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
