import XCTest

@MainActor
final class NativeActiveRecurringReminderDraftTests: XCTestCase {
    private struct Baseline: Decodable {
        var enabled: Bool
        var recipientIds: [String]
        var localTime: String
        var daysBefore: Int
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testNormalLightOwnedActiveBillUnsentDraft() throws {
        try journey(profile: "normal_light")
    }

    func testMaximumDarkOwnedActiveBillUnsentDraft() throws {
        try journey(profile: "maximum_dark")
    }

    private func journey(profile: String) throws {
        let baseline = try authorized(profile: profile)
        let app = openRule()
        addTeardownBlock { [app] in self.capture(app, name: "Active bill unsent terminal screen") }
        openReminder(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        let back = app.navigationBars["Bill reminder"].buttons["Back"]
        XCTAssertTrue(back.isEnabled && back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44 - 0.001)
        attach(
            ["frame": rect(back.frame), "leftInset": 2, "verticalPoint": "center"],
            name: "Bill reminder untouched Back target")
        capture(app, name: "Untouched original canonical bill reminder")
        back.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 2, dy: 0)).tap()
        requireDismissed(app)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        openReminder(app)
        let draft = makeDraft(app, baseline: baseline)
        back.tap()
        choose("Keep editing", in: app, name: "Back offers full Keep editing and Discard choices")
        assertSettings(app, baseline: draft, enabled: draft.enabled)
        capture(app, name: "Back Keep editing retains all unsent bill reminder settings")
        let refresh = app.buttons["Refresh choices"]
        reveal(refresh, in: app)
        requireAction(refresh, in: app)
        refresh.tap()
        choose("Keep editing", in: app, name: "Refresh offers full Keep editing and Discard choices")
        assertSettings(app, baseline: draft, enabled: draft.enabled)
        capture(app, name: "Refresh Keep editing retains all unsent settings")
        reveal(refresh, in: app)
        requireAction(refresh, in: app)
        refresh.tap()
        choose("Discard choices", in: app, name: "Refresh explicit Discard choices before reload")
        waitReady(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        capture(app, name: "Explicit Discard reload restores exact canonical bill reminder settings")
        _ = makeDraft(app, baseline: baseline)
        back.tap()
        choose("Discard choices", in: app, name: "Back explicit Discard choices exits unsent draft")
        requireDismissed(app)
        XCTAssertTrue(app.navigationBars["Recurring expense"].waitForExistence(timeout: 15))
        openReminder(app)
        assertSettings(app, baseline: baseline, enabled: baseline.enabled)
        back.tap()
        requireDismissed(app)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
        capture(app, name: "Back Discard and reopening preserve nil reminder defaults")
        restoreToday(app)
    }

    private func openRule() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        let link = app.buttons["Recurring expenses"]
        reveal(link, in: app)
        XCTAssertTrue(link.isEnabled && link.isHittable)
        link.tap()
        XCTAssertTrue(app.navigationBars["Recurring expenses"].waitForExistence(timeout: 15))
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Nest QA reminder bill 0610-5d1a"))
            .firstMatch
        reveal(row, in: app)
        XCTAssertTrue(row.isEnabled && row.isHittable)
        XCTAssertTrue(row.label.contains("Active"))
        attach(["frame": rect(row.frame), "label": row.label], name: "Whole exact active variable rule card")
        capture(app, name: "Existing active future variable rule before reminder navigation")
        row.tap()
        XCTAssertTrue(app.navigationBars["Recurring expense"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Active"].waitForExistence(timeout: 30))
        return app
    }

    private func openReminder(_ app: XCUIApplication) {
        XCTAssertFalse(app.navigationBars["Bill reminder"].exists)
        let choices = app.buttons["Reminder choices"]
        reveal(choices, in: app)
        requireAction(choices, in: app)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Bill reminder"].waitForExistence(timeout: 15))
        waitReady(app)
        let form = reminderForm(app)
        reveal(form.staticTexts["Nest QA reminder bill 0610-5d1a"], in: app, permitsDisabled: true)
        reveal(form.staticTexts["Next due 2026-11-01"], in: app, permitsDisabled: true)
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
        capture(app, name: "Exact active variable rule and real reminder choices loaded")
    }

    private func reminderForm(_ app: XCUIApplication) -> XCUIElement {
        let forms = app.collectionViews.allElementsBoundByIndex
        XCTAssertEqual(forms.count, 1, "Exactly one native foreground reminder Form is required")
        guard let form = forms.first else {
            XCTFail("Foreground reminder Form is missing")
            return app.collectionViews.firstMatch
        }
        let nav = app.navigationBars["Bill reminder"]
        XCTAssertTrue(nav.exists && form.exists)
        XCTAssertTrue(app.frame.contains(form.frame))
        XCTAssertGreaterThan(form.frame.maxY, nav.frame.maxY)
        return form
    }

    private func waitReady(_ app: XCUIApplication) {
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: app.navigationBars["Bill reminder"].buttons["Back"])
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func assertSettings(_ app: XCUIApplication, baseline: Baseline, enabled: Bool) {
        controlStart(app)
        let toggle = app.switches["Reminder enabled"]
        reveal(toggle, in: app)
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
        let lead = app.staticTexts["reminder-lead-value"]
        reveal(lead, in: app, permitsDisabled: true)
        XCTAssertEqual(lead.label, "Days before: \(baseline.daysBefore)")
        for (name, allowed) in [
            ("Decrease days before", enabled && baseline.daysBefore > 0),
            ("Increase days before", enabled && baseline.daysBefore < 730),
        ] {
            let button = app.buttons[name]
            reveal(button, in: app, permitsDisabled: true)
            XCTAssertTrue(button.exists)
            XCTAssertEqual(button.isEnabled, allowed)
            XCTAssertEqual(button.value as? String, "\(baseline.daysBefore) days")
            XCTAssertGreaterThanOrEqual(button.frame.width, 44 - 0.001)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44 - 0.001)
        }
    }

    private func makeDraft(_ app: XCUIApplication, baseline: Baseline) -> Baseline {
        XCTAssertFalse(baseline.enabled)
        var draft = baseline
        controlStart(app)
        for label in ["Reminder enabled", "Remind me", "Remind Test Sam"] {
            let toggle = app.switches[label]
            attach(["target": label, "direction": "downward from known header"], name: "Ordered draft target")
            reveal(toggle, in: app, missingDistance: 250)
            XCTAssertEqual(toggle.value as? String, "0")
            XCTAssertTrue(toggle.isEnabled && toggle.isHittable)
            toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
            waitSwitch(toggle, value: "1")
        }
        draft.enabled = true
        draft.recipientIds = ["791f7261-6c9d-4061-9c8a-57aa6e0b0200", "e5f80cfd-b69a-4aa0-a267-75784e943676"]
        setNineAM(app)
        draft.localTime = "09:00"
        let plus = app.buttons["Increase days before"]
        reveal(plus, in: app)
        XCTAssertTrue(plus.isEnabled && plus.isHittable)
        XCTAssertGreaterThanOrEqual(plus.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(plus.frame.height, 44 - 0.001)
        plus.tap()
        draft.daysBefore = 1
        assertSettings(app, baseline: draft, enabled: true)
        let save = app.buttons["Save reminder"]
        reveal(save, in: app)
        XCTAssertTrue(save.isEnabled && save.isHittable)
        capture(app, name: "Both nine AM lead one draft with Save available but never tapped")
        return draft
    }

    private func setNineAM(_ app: XCUIApplication) {
        let time = app.buttons["Time Picker"]
        reveal(time, in: app)
        XCTAssertTrue(time.isEnabled && time.isHittable)
        time.tap()
        capture(app, name: "Actual native bill time picker before unsent clock adjustment")
        XCTAssertEqual(app.pickerWheels.count, 3)
        let hour = app.pickerWheels.element(boundBy: 0)
        XCTAssertEqual(hour.value as? String, "8 o’clock")
        XCTAssertEqual(app.pickerWheels.element(boundBy: 1).value as? String, "00 minutes")
        XCTAssertEqual(app.pickerWheels.element(boundBy: 2).value as? String, "AM")
        XCTAssertTrue(hour.isEnabled && hour.isHittable)
        hour.adjust(toPickerWheelValue: "9")
        XCTAssertEqual(hour.value as? String, "9 o’clock")
        XCTAssertEqual(app.pickerWheels.element(boundBy: 1).value as? String, "00 minutes")
        XCTAssertEqual(app.pickerWheels.element(boundBy: 2).value as? String, "AM")
        let nav = app.navigationBars["Bill reminder"].frame
        let point = CGPoint(x: nav.midX, y: nav.midY)
        XCTAssertTrue(app.frame.contains(point))
        XCTAssertTrue(app.pickerWheels.allElementsBoundByIndex.allSatisfy { !$0.frame.contains(point) })
        attach(
            ["navigation": rect(nav), "dismissPoint": [point.x, point.y]], name: "Time popup outside dismissal point")
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: point.x, dy: point.y)).tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == 0"), object: app.pickerWheels)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
    }

    private func waitSwitch(_ toggle: XCUIElement, value: String) {
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: toggle)
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
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Bill reminder"])
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 15), .completed)
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false, missingDistance: CGFloat = 250
    ) {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let bounds = scrollBounds(app)
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
                attach(frames, name: "Measured actual bill reminder control viewport")
                return
            }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = scrollTravel(delta)
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
            frames[frames.count - 1].merge(motion(element, distance: distance)) { _, next in next }
        }
        attach(frames, name: "Failed bill reminder control viewport")
        capture(app, name: "Bill reminder control placement failure")
        XCTFail("Required control must be fully visible")
    }

    private func scrollBounds(_ app: XCUIApplication) -> CGRect {
        if app.navigationBars["Bill reminder"].exists { return reminderForm(app).frame }
        let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
        return lists.first(where: { $0.isHittable })?.frame ?? app.frame
    }

    private func scrollTravel(_ delta: CGFloat) -> CGFloat {
        let sign: CGFloat = delta < 0 ? -1 : 1
        let maximum: CGFloat = delta < 0 ? 180 : 250
        return sign * min(maximum, max(120, abs(delta)))
    }

    private func motion(_ element: XCUIElement, distance: CGFloat) -> [String: Any] {
        let exists = element.exists
        return ["distance": distance, "afterExists": exists, "afterFrame": rect(exists ? element.frame : .zero)]
    }

    private func authorized(profile: String) throws -> Baseline {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_ACTIVE_BILL_DRAFT_UI"] == "20261006" else {
                throw XCTSkip("Requires dated original active variable bill unsent draft verification.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_PROFILE"], profile)
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_RULE_ID"], "f854e3a3-ffda-4eb7-86e5-d3933d938444")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_REVISION"], "528417a1-b97a-4be4-9e63-ad7c8c03c2be")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_DUE"], "2026-11-01")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_ACTION"], "unsent_navigation_only")
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_POST_BUDGET"], "0")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            return Baseline(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0)
        #else
            throw XCTSkip("Fictional bill draft UI is forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        app.navigationBars["Recurring expense"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Recurring expenses"].exists)
        app.navigationBars["Recurring expenses"].buttons.element(boundBy: 0).tap()
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

    private func controlStart(_ app: XCUIApplication) {
        let form = reminderForm(app)
        reveal(
            form.staticTexts["Nest QA reminder bill 0610-5d1a"], in: app, permitsDisabled: true, missingDistance: -180)
        reveal(form.staticTexts["Next due 2026-11-01"], in: app, permitsDisabled: true)
    }

    private func requireAction(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.exists && element.isEnabled && element.isHittable)
        XCTAssertTrue(app.frame.contains(element.frame))
        XCTAssertGreaterThanOrEqual(element.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(element.frame.height, 44 - 0.001)
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
