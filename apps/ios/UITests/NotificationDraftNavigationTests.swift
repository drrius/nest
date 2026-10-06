import XCTest

@MainActor
final class NotificationDraftNavigationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
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
        reveal(reminders, in: app)
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
        XCTAssertEqual(reminders.value as? String, edited)
        reload.tap()
        choicesAlert(app).buttons["Discard edits"].tap()
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
        let save = app.navigationBars["Notifications"].buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
        return app
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Notifications"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Profile"].waitForExistence(timeout: 15))
        app.navigationBars["Profile"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<30 {
            let frame = element.exists ? element.frame : .zero
            if element.isHittable && frame.minY >= 80 && frame.maxY <= app.tabBars.firstMatch.frame.minY { return }
            let distance = element.exists ? max(-300, min(300, frame.minY - 130)) : 250
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Required notification control is not fully visible")
    }
}
