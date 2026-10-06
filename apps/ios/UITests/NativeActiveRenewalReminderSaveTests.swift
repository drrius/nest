import XCTest

@MainActor
final class NativeActiveRenewalReminderSaveTests: XCTestCase {
    private struct Baseline: Decodable {
        var enabled: Bool
        var recipientIds: [String]
        var localTime: String
        var anchor: String
        var daysBefore: Int
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOneNativeSaveAndRecordedCopy() throws {
        let baseline = try authorized(action: "save_once")
        let app = openRenewals()
        addTeardownBlock { [app] in self.capture(app, name: "One Save terminal screen") }
        openReminder(app)
        assertSettings(app, baseline: baseline, enabled: false)
        _ = makeDraft(app, baseline: baseline)
        let save = app.buttons["Save reminder"]
        reveal(save, in: app)
        XCTAssertTrue(save.isEnabled && save.isHittable)
        capture(app, name: "Both renewal nine AM one-day choices before the only Save")
        attach(
            ["SaveTapBudget": 1, "renewalId": "23435fe5-5b08-48cd-b0fb-03f0e2d49690"],
            name: "Single deliberate native Save")
        save.tap()
        let recorded = app.staticTexts["Reminder choices saved. This does not confirm delivery."]
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        reveal(recorded, in: app, permitsDisabled: true)
        capture(app, name: "Original reminder request recorded before journal capture")
    }

    func testColdRestartRecordedChoicesAndOrdinaryDone() throws {
        _ = try authorized(action: "recorded_done")
        let app = openRenewals()
        openReminder(app)
        for label in [
            "Your saved reminder request", "Before renewal", "1 days before · 09:00 Europe/Zurich", "For you",
            "For Test Sam", "Reminder choices saved. This does not confirm delivery.",
        ] {
            let text = app.staticTexts.matching(identifier: label).firstMatch
            reveal(text, in: app, permitsDisabled: true)
            XCTAssertTrue(text.exists)
            XCTAssertEqual(text.label, label)
            capture(app, name: "Cold restart retained original recorded copy: " + label)
        }
        let done = app.buttons["Done"]
        reveal(done, in: app)
        XCTAssertTrue(done.isEnabled && done.isHittable)
        capture(app, name: "Ordinary Done before clearing the exact recorded request")
        done.tap()
        let cleared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: done)
        XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["Your saved reminder request"].exists)
        app.navigationBars["Renewal reminder"].buttons["Back"].tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        restoreToday(app)
    }

    private func openRenewals() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let link = app.buttons["Manage renewals"]
        reveal(link, in: app)
        XCTAssertTrue(link.isEnabled && link.isHittable)
        link.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        let title = app.staticTexts["Nest QA reminder 0610-3f88"].firstMatch
        reveal(title, in: app, permitsDisabled: true)
        XCTAssertTrue(title.waitForExistence(timeout: 30))
        XCTAssertEqual(app.buttons.matching(identifier: "Reminder choices").count, 1)
        XCTAssertFalse(app.staticTexts["Your saved renewal request"].exists)
        return app
    }

    private func openReminder(_ app: XCUIApplication) {
        XCTAssertFalse(app.navigationBars["Renewal reminder"].exists)
        let choices = app.buttons["Reminder choices"]
        reveal(choices, in: app)
        XCTAssertTrue(choices.isEnabled && choices.isHittable)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Renewal reminder"].waitForExistence(timeout: 15))
        waitReady(app)
        if ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_REMINDER_ACTION"] == "save_once" {
            let form = reminderForm(app)
            reveal(form.staticTexts["Nest QA reminder 0610-3f88"], in: app, permitsDisabled: true)
            reveal(form.staticTexts["Renews 2026-10-07"], in: app, permitsDisabled: true)
            reveal(form.staticTexts["Cancel by 2026-10-07"], in: app, permitsDisabled: true)
        }
        XCTAssertFalse(app.staticTexts["Could not load reminder choices. Connect and try again."].exists)
        capture(app, name: "Exact active renewal and real reminder choices loaded")
    }

    private func reminderForm(_ app: XCUIApplication) -> XCUIElement {
        let forms = app.collectionViews.allElementsBoundByIndex.filter { $0.isHittable }
        XCTAssertEqual(forms.count, 1, "Exactly one hittable foreground reminder Form is required")
        guard let form = forms.first else {
            XCTFail("Foreground reminder Form is missing")
            return app.collectionViews.firstMatch
        }
        let nav = app.navigationBars["Renewal reminder"]
        XCTAssertTrue(nav.exists)
        XCTAssertTrue(app.frame.contains(form.frame))
        XCTAssertGreaterThan(form.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(form.frame.minY, nav.frame.minY)
        XCTAssertGreaterThan(form.frame.maxY, nav.frame.maxY)
        return form
    }

    private func waitReady(_ app: XCUIApplication) {
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "enabled == true"),
            object: app.navigationBars["Renewal reminder"].buttons["Back"])
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func assertSettings(
        _ app: XCUIApplication, baseline: Baseline, enabled: Bool, fromLowerSection: Bool = false
    ) {
        let anchor = app.buttons["Based on, " + baseline.anchor]
        reveal(anchor, in: app, missingDistance: fromLowerSection ? -180 : 250)
        XCTAssertEqual(anchor.label, "Based on, " + baseline.anchor)
        XCTAssertTrue(anchor.isEnabled)
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
        let title = reminderForm(app).staticTexts["Nest QA reminder 0610-3f88"]
        reveal(title, in: app, permitsDisabled: true, missingDistance: -180)
        let titleFrame = rect(title.frame)
        let basedOn = app.buttons["Based on, " + baseline.anchor]
        reveal(basedOn, in: app)
        attach(
            ["titleBeforeScroll": titleFrame, "basedOn": rect(basedOn.frame)],
            name: "Known foreground section before ordered draft traversal")
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
        let anchor = app.buttons["Based on, Cancellation deadline"]
        reveal(anchor, in: app, missingDistance: -180)
        XCTAssertTrue(anchor.isEnabled && anchor.isHittable)
        anchor.tap()
        let renewal = app.buttons["Renewal date"]
        XCTAssertTrue(renewal.waitForExistence(timeout: 15))
        XCTAssertTrue(renewal.isEnabled && renewal.isHittable)
        renewal.tap()
        draft.anchor = "Renewal date"
        setNineAM(app)
        draft.localTime = "09:00"
        let plus = app.buttons["Increase days before"]
        reveal(plus, in: app)
        XCTAssertTrue(plus.isEnabled && plus.isHittable)
        XCTAssertGreaterThanOrEqual(plus.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(plus.frame.height, 44 - 0.001)
        plus.tap()
        draft.daysBefore = 1
        assertSettings(app, baseline: draft, enabled: true, fromLowerSection: true)
        return draft
    }

    private func setNineAM(_ app: XCUIApplication) {
        let time = app.buttons["Time Picker"]
        reveal(time, in: app)
        XCTAssertTrue(time.isEnabled && time.isHittable)
        time.tap()
        capture(app, name: "Actual native renewal time picker before unsent clock adjustment")
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
        let nav = app.navigationBars["Renewal reminder"].frame
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
                attach(frames, name: "Measured actual renewal reminder control viewport")
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
        attach(frames, name: "Failed renewal reminder control viewport")
        capture(app, name: "Renewal reminder control placement failure")
        XCTFail("Required control must be fully visible")
    }

    private func scrollBounds(_ app: XCUIApplication) -> CGRect {
        if app.navigationBars["Renewal reminder"].exists { return reminderForm(app).frame }
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

    private func authorized(action: String) throws -> Baseline {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RENEWAL_REMINDER_SAVE_UI"] == "20261006" else {
                throw XCTSkip("Requires dated single reminder Save or recorded Done scope.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_RENEWAL_ID"], "23435fe5-5b08-48cd-b0fb-03f0e2d49690")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMINDER_SAVE_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REVISION"], "6610131c-d4d9-42fc-89f2-42ffe0a7b777")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMINDER_ACTION"], action)
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMINDER_POST_BUDGET"], action == "save_once" ? "1" : "0")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMINDER_SAVE_PROFILE"], "normal_light")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            let raw = try XCTUnwrap(env["NEST_QA_RENEWAL_REMINDER_DRAFT_SETTINGS_JSON"])
            return try JSONDecoder().decode(Baseline.self, from: Data(raw.utf8))
        #else
            throw XCTSkip("Fictional renewal reminder navigation is forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        if app.navigationBars["Renewals"].exists {
            app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
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
