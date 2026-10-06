import XCTest

@MainActor
final class NotificationDraftNavigationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testRecordLargeTextNotificationControlsWithoutEditing() throws {
        let fixture = try NativeMealWeekFixture(action: "notification_draft")
        let app = openChoices(fixture)
        var observations: [[String: Any]] = []
        for stage in 0..<5 {
            let nodes = app.descendants(matching: .any).matching(
                NSPredicate(format: "label CONTAINS[c] %@", "reminder")
            ).allElementsBoundByIndex
            observations.append([
                "stage": stage, "nodes": nodes.prefix(16).map { geometry($0) },
                "switches": app.switches.allElementsBoundByIndex.prefix(8).map { geometry($0) },
                "namedExists": app.switches["Receive item reminders"].exists,
                "predicateExists": app.switches.matching(
                    NSPredicate(format: "label == %@", "Receive item reminders")
                ).firstMatch.exists,
            ])
            let capture = XCTAttachment(screenshot: app.screenshot())
            capture.name = "Notification control census stage \(stage)"
            capture.lifetime = .keepAlways
            add(capture)
            if stage == 2 {
                let reminder = app.switches.matching(
                    NSPredicate(format: "label == %@", "Receive item reminders")
                ).firstMatch
                XCTAssertTrue(reminder.exists)
                let distance = scrollDistance(reminder.frame, bottom: app.tabBars.firstMatch.frame.minY)
                let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
                let end = app.coordinate(
                    withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
                start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
            } else if stage < 4 {
                app.swipeUp()
            }
        }
        let report = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: observations, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        report.name = "Notification control geometry census"
        report.lifetime = .keepAlways
        add(report)
        finish(app)
    }

    private func geometry(_ element: XCUIElement) -> [String: Any] {
        let frame = element.frame
        return [
            "label": element.label, "type": element.elementType.rawValue,
            "value": element.value as? String ?? "", "hittable": element.isHittable,
            "frame": [frame.minX, frame.minY, frame.width, frame.height],
        ]
    }

    func testDeviceConnectionRoundTripPreservesUnsentChoices() throws {
        let fixture = try NativeMealWeekFixture(action: "notification_draft")
        let app = openChoices(fixture)
        let reminders = app.switches["Receive item reminders"]
        reveal(reminders, in: app)
        let initial = try XCTUnwrap(reminders.value as? String)
        let edited = flip(reminders, from: initial)
        XCTAssertNotEqual(edited, initial)
        let connection = app.buttons["This iPhone’s connection"]
        reveal(connection, in: app)
        connection.tap()
        XCTAssertTrue(app.navigationBars["This iPhone"].waitForExistence(timeout: 15))
        app.navigationBars["This iPhone"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 15))
        reveal(reminders, in: app, earlier: true)
        XCTAssertEqual(reminders.value as? String, edited)
        XCTAssertEqual(flip(reminders, from: edited), initial)
        finish(app)
    }

    func testBackAndReloadRequireExplicitDiscard() throws {
        let fixture = try NativeMealWeekFixture(action: "notification_draft")
        let app = openChoices(fixture)
        let reminders = app.switches["Receive item reminders"]
        reveal(reminders, in: app)
        let initial = try XCTUnwrap(reminders.value as? String)
        let edited = flip(reminders, from: initial)
        let back = app.navigationBars["Notifications"].buttons["Back"]
        XCTAssertTrue(back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44)
        back.tap()
        let alert = choicesAlert(app)
        alert.buttons["Keep editing"].tap()
        XCTAssertEqual(reminders.value as? String, edited)
        let reload = app.buttons["Reload choices"]
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Keep editing"].tap()
        reveal(reminders, in: app, earlier: true)
        XCTAssertEqual(reminders.value as? String, edited)
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Discard edits"].tap()
        waitForChoices(app)
        reveal(reminders, in: app, earlier: true)
        let restored = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", initial), object: reminders)
        XCTAssertEqual(XCTWaiter.wait(for: [restored], timeout: 30), .completed)
        reveal(reminders, in: app)
        XCTAssertEqual(flip(reminders, from: initial), edited)
        app.navigationBars["Notifications"].buttons["Back"].tap()
        choicesAlert(app).buttons["Discard edits"].tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        let choices = app.buttons["Your notification choices"]
        reveal(choices, in: app)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 15))
        waitForChoices(app)
        reveal(reminders, in: app)
        XCTAssertEqual(reminders.value as? String, initial)
        finish(app)
    }

    private func choicesAlert(_ app: XCUIApplication) -> XCUIElement {
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        XCTAssertTrue(alert.staticTexts["Discard edits?"].exists)
        XCTAssertGreaterThanOrEqual(alert.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(alert.frame.maxY, app.frame.maxY)
        for title in ["Keep editing", "Discard edits"] {
            let button = alert.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
            XCTAssertGreaterThanOrEqual(button.frame.minY, alert.frame.minY)
            XCTAssertLessThanOrEqual(button.frame.maxY, alert.frame.maxY)
        }
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Notification draft discard choices"
        capture.lifetime = .keepAlways
        add(capture)
        return alert
    }

    private func flip(_ toggle: XCUIElement, from value: String) -> String {
        toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value != %@", value), object: toggle)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
        return toggle.value as? String ?? "missing"
    }

    private func openChoices(_ fixture: NativeMealWeekFixture) -> XCUIApplication {
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        let choices = app.buttons["Your notification choices"]
        reveal(choices, in: app)
        choices.tap()
        XCTAssertTrue(app.navigationBars["Notifications"].waitForExistence(timeout: 15))
        waitForChoices(app)
        return app
    }

    private func waitForChoices(_ app: XCUIApplication) {
        let save = app.navigationBars["Notifications"].buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Notifications"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        app.navigationBars["Profile"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication, earlier: Bool = false) {
        for _ in 0..<30 {
            let frame = element.exists ? element.frame : .zero
            let bottom = app.tabBars.firstMatch.frame.minY
            if element.isHittable && frame.minY >= 80 && frame.maxY <= bottom { return }
            if frame.isEmpty {
                if earlier { app.swipeDown(velocity: .slow) } else { app.swipeUp(velocity: .slow) }
                continue
            }
            let distance = scrollDistance(frame, bottom: bottom)
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Notification reveal failure"
        capture.lifetime = .keepAlways
        add(capture)
        XCTFail("Required notification control is not fully visible")
    }

    private func scrollDistance(_ frame: CGRect, bottom: CGFloat) -> CGFloat {
        guard !frame.isEmpty else { return 180 }
        let delta = frame.minY < 80 ? frame.minY - 100 : frame.maxY - bottom + 24
        return max(-120, min(120, delta))
    }
}
