import XCTest

@MainActor
final class MealPreferenceDraftTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testFoodBackProtectsAnInvalidUnsentDraft() throws {
        let fixture = try NativeMealWeekFixture(action: "meal_preference_draft")
        let app = open("Your food preferences", title: "Your food preferences", fixture: fixture)
        let add = app.buttons["Add dislike"]
        reveal(add, in: app)
        let before = app.textFields.matching(identifier: "Dislike").count
        add.tap()
        XCTAssertEqual(app.textFields.matching(identifier: "Dislike").count, before + 1)
        XCTAssertFalse(app.navigationBars["Your food preferences"].buttons["Save"].isEnabled)
        app.tabBars.firstMatch.buttons["Meals"].tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Your food preferences"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.textFields.matching(identifier: "Dislike").count, before + 1)
        app.navigationBars["Your food preferences"].buttons.element(boundBy: 0).tap()
        let alert = choicesAlert(app)
        alert.buttons["Keep editing"].tap()
        XCTAssertEqual(app.textFields.matching(identifier: "Dislike").count, before + 1)
        let reload = app.buttons["Reload current preferences"]
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Keep editing"].tap()
        reveal(add, in: app, earlier: true)
        XCTAssertEqual(app.textFields.matching(identifier: "Dislike").count, before + 1)
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Discard edits"].tap()
        waitForSave("Your food preferences", in: app)
        reveal(add, in: app, earlier: true)
        XCTAssertEqual(app.textFields.matching(identifier: "Dislike").count, before)
        add.tap()
        app.navigationBars["Your food preferences"].buttons["Back"].tap()
        choicesAlert(app).buttons["Discard edits"].tap()
        finish(app)
    }

    func testCookingBackProtectsAnUnsentSlotChoice() throws {
        let fixture = try NativeMealWeekFixture(action: "meal_preference_draft")
        let app = open("Household cooking preferences", title: "Cooking preferences", fixture: fixture)
        let breakfast = app.switches["Breakfast"]
        reveal(breakfast, in: app)
        let initial = try XCTUnwrap(breakfast.value as? String)
        breakfast.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        let changed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value != %@", initial), object: breakfast)
        XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
        let edited = breakfast.value as? String
        app.tabBars.firstMatch.buttons["Meals"].tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.navigationBars["Cooking preferences"].waitForExistence(timeout: 15))
        XCTAssertEqual(breakfast.value as? String, edited)
        app.navigationBars["Cooking preferences"].buttons.element(boundBy: 0).tap()
        let alert = choicesAlert(app)
        alert.buttons["Keep editing"].tap()
        XCTAssertEqual(breakfast.value as? String, edited)
        let reload = app.buttons["Reload current preferences"]
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Keep editing"].tap()
        reveal(breakfast, in: app, earlier: true)
        XCTAssertEqual(breakfast.value as? String, edited)
        reveal(reload, in: app)
        reload.tap()
        choicesAlert(app).buttons["Discard edits"].tap()
        waitForSave("Cooking preferences", in: app)
        reveal(breakfast, in: app, earlier: true)
        XCTAssertEqual(breakfast.value as? String, initial)
        breakfast.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
        app.navigationBars["Cooking preferences"].buttons["Back"].tap()
        choicesAlert(app).buttons["Discard edits"].tap()
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
        capture.name = "Meal preference draft choices"
        capture.lifetime = .keepAlways
        add(capture)
        return alert
    }

    private func open(_ label: String, title: String, fixture: NativeMealWeekFixture) -> XCUIApplication {
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        let link = app.buttons[label]
        reveal(link, in: app)
        link.tap()
        XCTAssertTrue(app.navigationBars[title].waitForExistence(timeout: 15))
        waitForSave(title, in: app)
        return app
    }

    private func waitForSave(_ title: String, in app: XCUIApplication) {
        let save = app.navigationBars[title].buttons["Save"]
        let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
    }

    private func finish(_ app: XCUIApplication) {
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
            let delta = frame.minY < 80 ? frame.minY - 100 : frame.maxY - bottom + 24
            let distance = max(-120, min(120, delta))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Meal preference control is not fully visible")
    }
}
