import XCTest

@MainActor
final class NativeManualPreparationTests: XCTestCase {
    private let title = "Nest native preparation 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCreateOneOwnedSharedPreparation() throws {
        let week = try open(action: "create_owned_preparation")
        XCTAssertEqual(week.fixture.name, "Test Alex")
        XCTAssertTrue(week.app.staticTexts["No preparation linked yet."].waitForExistence(timeout: 30))
        let add = week.app.buttons["Add preparation"]
        week.reveal(add)
        XCTAssertTrue(add.isEnabled)
        add.tap()
        let navigation = week.app.navigationBars["Add preparation"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        controls(navigation)
        type(title, label: "Task", app: week.app)
        type("Soak the fictional lentils.", label: "Instructions", app: week.app)
        save(navigation, app: week.app)
        XCTAssertTrue(week.app.staticTexts[title].waitForExistence(timeout: 30))
        XCTAssertTrue(week.app.staticTexts["Shared"].exists)
        capture("Owned shared preparation saved", app: week.app)
        finish(week.app)
    }

    func testPartnerEditsOwnedInstructionsAndResponsibilityOnce() throws {
        let week = try open(action: "edit_owned_preparation")
        XCTAssertEqual(week.fixture.name, "Test Sam")
        XCTAssertTrue(week.app.staticTexts[title].waitForExistence(timeout: 30))
        let edit = week.app.buttons["Edit preparation"]
        week.reveal(edit)
        edit.tap()
        let navigation = week.app.navigationBars["Edit preparation"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        controls(navigation)
        let field = week.app.textFields["Instructions"]
        XCTAssertEqual(field.value as? String, "Soak the fictional lentils.")
        field.tap()
        XCTAssertTrue(week.app.keyboards.firstMatch.waitForExistence(timeout: 15))
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.9)).tap()
        for _ in "Soak the fictional lentils." { week.app.keyboards.keys["delete"].tap() }
        field.typeText("Drain the fictional lentils.")
        week.app.buttons["Done"].tap()
        XCTAssertEqual(field.value as? String, "Drain the fictional lentils.")
        choose("Assignment", value: "One person", app: week.app)
        choose("Person", value: "Test Sam", app: week.app)
        save(navigation, app: week.app)
        XCTAssertTrue(week.app.staticTexts["Assigned to Test Sam"].waitForExistence(timeout: 30))
        XCTAssertTrue(week.app.staticTexts["Drain the fictional lentils."].exists)
        capture("Partner edits the same linked preparation", app: week.app)
        finish(week.app)
    }

    func testBothMembersReadOwnedPreparationWithoutChangingIt() throws {
        let week = try open(action: "read_owned_preparation")
        let phase = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_PREPARATION_PHASE"])
        XCTAssertTrue(["shared", "assigned", "due_today", "completed"].contains(phase))
        XCTAssertTrue(week.app.staticTexts[title].waitForExistence(timeout: 30))
        let instructions = week.app.staticTexts[
            phase == "shared" ? "Soak the fictional lentils." : "Drain the fictional lentils."]
        week.reveal(instructions)
        XCTAssertTrue(instructions.isHittable)
        XCTAssertTrue(week.app.staticTexts[phase == "shared" ? "Shared" : "Assigned to Test Sam"].exists)
        let status = week.app.staticTexts[phase == "completed" ? "Completed" : "To do"]
        week.reveal(status)
        XCTAssertTrue(status.isHittable)
        capture(week.fixture.name + " reads owned preparation", app: week.app)
        finish(week.app)
    }

    private func open(action: String) throws -> NativeOwnedMealWeek {
        let week = try NativeOwnedMealWeek(action: action)
        let meal = week.app.buttons["2026-10-19, Dinner: \(week.fixture.title), recipe details"]
        week.reveal(meal)
        meal.tap()
        XCTAssertTrue(week.app.navigationBars["Planned meal"].waitForExistence(timeout: 15))
        let preparation = week.app.buttons["Meal preparation"]
        week.reveal(preparation)
        preparation.tap()
        XCTAssertTrue(week.app.navigationBars["Meal preparation"].waitForExistence(timeout: 15))
        return week
    }

    private func controls(_ navigation: XCUIElement) {
        for title in ["Cancel", "Save"] {
            let button = navigation.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height + 0.000_001, 44)
        }
    }

    private func type(_ value: String, label: String, app: XCUIApplication) {
        let field = app.textFields[label]
        XCTAssertTrue(field.isHittable)
        field.tap()
        field.typeText(value)
        app.buttons["Done"].tap()
        XCTAssertEqual(field.value as? String, value)
    }

    private func choose(_ label: String, value: String, app: XCUIApplication) {
        let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
        XCTAssertTrue(picker.isHittable)
        picker.tap()
        XCTAssertTrue(app.buttons[value].waitForExistence(timeout: 15))
        app.buttons[value].tap()
    }

    private func save(_ navigation: XCUIElement, app: XCUIApplication) {
        XCTAssertTrue(navigation.buttons["Save"].isEnabled)
        navigation.buttons["Save"].tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: navigation)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Meal preparation"].buttons.element(boundBy: 0).tap()
        app.navigationBars["Planned meal"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }
}
