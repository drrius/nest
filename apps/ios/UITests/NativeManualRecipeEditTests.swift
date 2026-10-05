import XCTest

@MainActor
final class NativeManualRecipeEditTests: XCTestCase {
    private let original = "Simmer the fictional ingredients."
    private let edited = "Simmer the fictional ingredients. Rest before serving."

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
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
        let field = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label == %@ AND (elementType == %d OR elementType == %d)",
                "Cooking instructions", XCUIElement.ElementType.textField.rawValue,
                XCUIElement.ElementType.textView.rawValue)
        ).firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 30))
        XCTAssertEqual(field.value as? String, before)
        field.tap()
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.1)).press(forDuration: 1)
        let selectAll = app.buttons["Select All"]
        XCTAssertTrue(selectAll.waitForExistence(timeout: 10))
        selectAll.tap()
        field.typeText(after)
        app.buttons["Done"].tap()
        let hidden = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 15), .completed)
        XCTAssertEqual(field.value as? String, after)
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
}
