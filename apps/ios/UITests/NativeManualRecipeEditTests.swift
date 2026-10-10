import XCTest

@MainActor
final class NativeManualRecipeEditTests: XCTestCase {
    private let original = "Simmer the fictional ingredients."
    private let edited = "Simmer the fictional ingredients. Rest before serving."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testBothMembersCanEditInstructionsWithoutSaving() throws {
        let fixture = try NativeMealWeekFixture(action: "probe_recipe_selection")
        let app = fixture.openLibrary()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 30))
        fixture.reveal(row, in: app)
        row.tap()
        XCTAssertTrue(app.navigationBars["Recipe"].waitForExistence(timeout: 15))
        app.buttons["Edit recipe"].tap()
        let navigation = app.navigationBars["Edit recipe"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 30))
        let field = replaceInstructions(original, with: original, in: app)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = fixture.name + " edits and restores unsent instructions"
        image.lifetime = .keepAlways
        add(image)
        XCTAssertEqual(field.value as? String, original)
        XCTAssertFalse(navigation.buttons["Save"].isEnabled)
        navigation.buttons["Cancel"].tap()
        let alert = app.alerts["Discard changes?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 10))
        alert.buttons["Discard changes"].tap()
        XCTAssertTrue(app.navigationBars["Recipe"].waitForExistence(timeout: 15))
        app.navigationBars["Recipe"].buttons.element(boundBy: 0).tap()
        fixture.finish(app)
    }

    func testChangeOnlyOwnedRecipeInstructionsOnce() throws {
        let fixture = try NativeMealWeekFixture(action: "edit_owned_recipe")
        let phase = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_MANUAL_RECIPE_EDIT_PHASE"])
        XCTAssertTrue(["edited", "original"].contains(phase))
        XCTAssertEqual(fixture.name, phase == "edited" ? "Test Alex" : "Test Sam")
        let before = phase == "edited" ? original : edited
        let after = phase == "edited" ? edited : original
        let app = fixture.openLibrary()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 30))
        fixture.reveal(row, in: app)
        row.tap()
        XCTAssertTrue(app.navigationBars["Recipe"].waitForExistence(timeout: 15))
        let edit = app.buttons["Edit recipe"]
        XCTAssertTrue(edit.isHittable)
        XCTAssertGreaterThanOrEqual(edit.frame.height + 0.000_001, 44)
        edit.tap()
        let navigation = app.navigationBars["Edit recipe"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 30))
        _ = replaceInstructions(before, with: after, in: app)
        let save = navigation.buttons["Save"]
        XCTAssertTrue(save.isEnabled && save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.height + 0.000_001, 44)
        save.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: navigation)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        let instructions = app.staticTexts[after]
        XCTAssertTrue(instructions.waitForExistence(timeout: 30))
        fixture.reveal(instructions, in: app)
        XCTAssertTrue(instructions.isHittable)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "Owned library instructions " + phase
        image.lifetime = .keepAlways
        add(image)
        app.navigationBars["Recipe"].buttons.element(boundBy: 0).tap()
        fixture.finish(app)
    }

    func testBothMembersReadUnchangedCapturedInstructions() throws {
        let week = try NativeOwnedMealWeek(action: "read_owned_planned_recipe")
        let app = week.app
        let meal = app.buttons["2026-10-19, Dinner: \(week.fixture.title), recipe details"]
        week.reveal(meal)
        meal.tap()
        XCTAssertTrue(app.navigationBars["Planned meal"].waitForExistence(timeout: 15))
        let instructions = app.staticTexts[original]
        XCTAssertTrue(instructions.waitForExistence(timeout: 30))
        week.reveal(instructions)
        XCTAssertTrue(instructions.isHittable)
        XCTAssertFalse(app.staticTexts[edited].exists)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = week.fixture.name + " reads unchanged planned instructions"
        image.lifetime = .keepAlways
        add(image)
        app.navigationBars["Planned meal"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func replaceInstructions(_ before: String, with after: String, in app: XCUIApplication) -> XCUIElement {
        let field = app.textFields["Cooking instructions"]
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        XCTAssertEqual(field.value as? String, before)
        XCTAssertTrue(field.isHittable && field.isEnabled)
        field.tap()
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 15))
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.9)).tap()
        let delete = keyboard.keys["delete"]
        XCTAssertTrue(delete.isHittable)
        for _ in before { delete.tap() }
        field.typeText(after)
        app.buttons["Done"].tap()
        let hidden = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: keyboard)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 15), .completed)
        XCTAssertEqual(field.value as? String, after)
        return field
    }
}
