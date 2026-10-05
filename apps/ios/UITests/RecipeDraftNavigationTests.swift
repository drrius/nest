import XCTest

@MainActor
final class RecipeDraftNavigationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testVerifiedMemberLibraryOpensWithoutCreatingRecipe() throws {
        let fixture = try NativeMealWeekFixture(action: "read_only")
        let app = fixture.openLibrary()
        XCTAssertTrue(app.buttons["New recipe"].exists)
        if ProcessInfo.processInfo.environment["NEST_QA_MANUAL_WEEK_EXPECT_RECIPE"] == "created" {
            let recipe = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
            XCTAssertTrue(recipe.waitForExistence(timeout: 30))
            fixture.reveal(recipe, in: app)
            XCTAssertTrue(recipe.isHittable && recipe.label.contains("Serves 2"))
        }
        fixture.finish(app)
    }

    func testCreateOwnedRecipeOnce() throws {
        let fixture = try NativeMealWeekFixture(action: "create_recipe")
        XCTAssertEqual(fixture.name, "Test Alex")
        let app = fixture.openLibrary()
        XCTAssertFalse(
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch.exists)
        app.buttons["New recipe"].tap()
        XCTAssertTrue(app.navigationBars["New recipe"].waitForExistence(timeout: 15))
        type(fixture.title, into: "Name", in: app, fixture: fixture)
        type("Simmer the fictional ingredients.", into: "Cooking instructions", in: app, fixture: fixture)
        type("QA lentils", into: "Ingredient 1 name", in: app, fixture: fixture)
        type("200", into: "Ingredient 1 quantity (optional)", in: app, fixture: fixture)
        type("g", into: "Ingredient 1 unit (optional)", in: app, fixture: fixture)
        let add = app.buttons["Add ingredient"]
        fixture.reveal(add, in: app)
        add.tap()
        type("QA rice", into: "Ingredient 2 name", in: app, fixture: fixture)
        type("100", into: "Ingredient 2 quantity (optional)", in: app, fixture: fixture)
        type("g", into: "Ingredient 2 unit (optional)", in: app, fixture: fixture)
        let save = app.navigationBars["New recipe"].buttons["Save"]
        XCTAssertTrue(save.isEnabled && save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.height + 0.000_001, 44)
        save.tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["New recipe"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        XCTAssertTrue(row.waitForExistence(timeout: 30))
        fixture.reveal(row, in: app)
        XCTAssertTrue(row.label.contains("Serves 2"))
        fixture.finish(app)
    }

    func testKeepEditingPreservesRecipeFieldsUntilExplicitDiscard() throws {
        let fixture = try NativeMealWeekFixture(action: "draft_navigation")
        let app = fixture.openLibrary()
        app.buttons["New recipe"].tap()
        XCTAssertTrue(app.navigationBars["New recipe"].waitForExistence(timeout: 15))
        type(fixture.title, into: "Name", in: app, fixture: fixture)
        type("Simmer the fictional ingredients.", into: "Cooking instructions", in: app, fixture: fixture)
        type("QA lentils", into: "Ingredient 1 name", in: app, fixture: fixture)
        type("200", into: "Ingredient 1 quantity (optional)", in: app, fixture: fixture)
        type("g", into: "Ingredient 1 unit (optional)", in: app, fixture: fixture)
        type("Rinse first.", into: "Ingredient 1 note (optional)", in: app, fixture: fixture)
        let navigation = app.navigationBars["New recipe"]
        XCTAssertTrue(navigation.buttons["Save"].isEnabled)
        for title in ["Cancel", "Save"] {
            XCTAssertTrue(navigation.buttons[title].isHittable)
            XCTAssertGreaterThanOrEqual(navigation.buttons[title].frame.height + 0.000_001, 44)
        }
        navigation.buttons["Cancel"].tap()
        let alert = confirmation(in: app)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Recipe draft confirmation"
        capture.lifetime = .keepAlways
        add(capture)
        alert.buttons["Keep editing"].tap()
        fixture.returnToRecipeStart(input("Name", in: app), in: app)
        for (label, value) in [
            ("Name", fixture.title), ("Servings", "2"),
            ("Cooking instructions", "Simmer the fictional ingredients."),
            ("Ingredient 1 name", "QA lentils"), ("Ingredient 1 quantity (optional)", "200"),
            ("Ingredient 1 unit (optional)", "g"), ("Ingredient 1 note (optional)", "Rinse first."),
        ] {
            let field = input(label, in: app)
            fixture.reveal(field, in: app)
            XCTAssertEqual(field.value as? String, value)
        }
        navigation.buttons["Cancel"].tap()
        confirmation(in: app).buttons["Discard draft"].tap()
        XCTAssertTrue(app.navigationBars["Saved meals"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.navigationBars["New recipe"].exists)
        fixture.finish(app)
    }

    private func type(_ value: String, into label: String, in app: XCUIApplication, fixture: NativeMealWeekFixture) {
        let field = input(label, in: app)
        fixture.reveal(field, in: app)
        XCTAssertTrue(field.isHittable)
        field.tap()
        field.typeText(value)
        let done = app.buttons["Done"]
        XCTAssertTrue(done.waitForExistence(timeout: 15))
        XCTAssertTrue(done.isHittable)
        done.tap()
        let hidden = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [hidden], timeout: 15), .completed)
        XCTAssertEqual(field.value as? String, value)
    }

    private func input(_ label: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label == %@ AND (elementType == %d OR elementType == %d)", label,
                XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue)
        ).firstMatch
    }

    private func confirmation(in app: XCUIApplication) -> XCUIElement {
        let alert = app.alerts["Discard draft?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        XCTAssertGreaterThanOrEqual(alert.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(alert.frame.maxY, app.frame.maxY)
        for title in ["Keep editing", "Discard draft"] {
            let button = alert.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height + 0.000_001, 44)
            XCTAssertGreaterThanOrEqual(button.frame.minY, alert.frame.minY)
            XCTAssertLessThanOrEqual(button.frame.maxY, alert.frame.maxY)
        }
        return alert
    }
}
