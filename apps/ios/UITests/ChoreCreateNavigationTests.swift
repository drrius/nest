import XCTest

@MainActor
final class ChoreCreateNavigationTests: XCTestCase {
    private let draftTitle = "Nest unsaved chore draft 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testUnchangedFormReturnsWithoutDiscardPrompt() throws {
        let fixture = try NativeChorePairFixture(action: "draft_navigation")
        let app = openForm(fixture)
        app.navigationBars["Add chore"].buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons["Discard draft"].exists)
        fixture.finish(app, backs: 1)
    }

    func testKeepEditingPreservesDraftUntilExplicitDiscard() throws {
        let fixture = try NativeChorePairFixture(action: "draft_navigation")
        let app = openForm(fixture)
        let field = app.textFields["What needs doing?"]
        field.tap()
        field.typeText(draftTitle)
        let dismissKeyboard = app.buttons["Dismiss keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 15))
        dismissKeyboard.tap()
        let hidden = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 15), .completed)
        chooseDaily(in: app, fixture: fixture)
        let back = app.navigationBars["Add chore"].buttons.element(boundBy: 0)
        XCTAssertTrue(back.isHittable)
        XCTAssertGreaterThanOrEqual(back.frame.height, 44)
        back.tap()
        let keep = confirmation(in: app)
        let confirmation = XCTAttachment(screenshot: app.screenshot())
        confirmation.name = "Unsaved chore confirmation"
        confirmation.lifetime = .keepAlways
        add(confirmation)
        keep.tap()
        XCTAssertTrue(app.navigationBars["Add chore"].exists)
        XCTAssertEqual(field.value as? String, draftTitle)
        XCTAssertTrue(repeatPicker(in: app).label.contains("Every day"))
        back.tap()
        let discard = app.buttons["Discard draft"]
        XCTAssertTrue(discard.waitForExistence(timeout: 15))
        discard.tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", draftTitle)).firstMatch.exists)
        fixture.finish(app, backs: 1)
    }

    func testScheduleOnlyChangeRequiresExplicitDiscard() throws {
        let fixture = try NativeChorePairFixture(action: "draft_navigation")
        let app = openForm(fixture)
        chooseDaily(in: app, fixture: fixture)
        app.navigationBars["Add chore"].buttons["Back"].tap()
        let keep = confirmation(in: app)
        keep.tap()
        XCTAssertTrue(repeatPicker(in: app).label.contains("Every day"))
        app.navigationBars["Add chore"].buttons["Back"].tap()
        app.buttons["Discard draft"].tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        fixture.finish(app, backs: 1)
    }

    private func openForm(_ fixture: NativeChorePairFixture) -> XCUIApplication {
        let app = fixture.openRoutines()
        app.buttons["Add chore"].tap()
        XCTAssertTrue(app.navigationBars["Add chore"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.textFields["What needs doing?"].waitForExistence(timeout: 15))
        return app
    }

    private func confirmation(in app: XCUIApplication) -> XCUIElement {
        let alert = app.alerts["Discard draft?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        XCTAssertGreaterThanOrEqual(alert.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(alert.frame.maxY, app.frame.maxY)
        let heading = alert.staticTexts["Discard draft?"]
        XCTAssertTrue(heading.exists)
        XCTAssertGreaterThanOrEqual(heading.frame.minY, alert.frame.minY)
        XCTAssertLessThanOrEqual(heading.frame.maxY, alert.frame.maxY)
        for title in ["Keep editing", "Discard draft"] {
            let button = alert.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44)
            XCTAssertGreaterThanOrEqual(button.frame.minY, alert.frame.minY)
            XCTAssertLessThanOrEqual(button.frame.maxY, alert.frame.maxY)
        }
        return alert.buttons["Keep editing"]
    }

    private func repeatPicker(in app: XCUIApplication) -> XCUIElement {
        app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Repeat")).firstMatch
    }

    private func chooseDaily(in app: XCUIApplication, fixture: NativeChorePairFixture) {
        let repeatChoice = repeatPicker(in: app)
        fixture.reveal(repeatChoice, in: app)
        repeatChoice.tap()
        let daily = app.buttons["Every day"]
        XCTAssertTrue(daily.waitForExistence(timeout: 15))
        daily.tap()
    }
}
