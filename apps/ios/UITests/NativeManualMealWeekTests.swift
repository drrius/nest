import XCTest

@MainActor
final class NativeManualMealWeekTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testReadOwnedFullWeekWithoutChanges() throws {
        let fixture = try NativeMealWeekFixture(action: "read_week")
        let app = fixture.openLibrary()
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        returnToWeekNavigation(in: app)
        openOwnedWeek(in: app)
        for day in 19...25 {
            let date = "2026-10-\(day)"
            let title = day == 19 ? fixture.title : "\(fixture.title) · \(date)"
            let meal = app.buttons["\(date), Dinner: \(title), recipe details"]
            revealOnBoard(meal, in: app)
            XCTAssertTrue(meal.isHittable)
            XCTAssertFalse(app.buttons["\(date), Dinner: Add meal"].exists)
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testPlaceOneOwnedDinnerOnce() throws {
        let fixture = try NativeMealWeekFixture(action: "place_dinner")
        XCTAssertEqual(fixture.name, "Test Alex")
        let date = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_MANUAL_WEEK_DATE"])
        XCTAssertTrue((19...25).map { "2026-10-\($0)" }.contains(date))
        let app = fixture.openLibrary()
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        returnToWeekNavigation(in: app)
        openOwnedWeek(in: app)
        let add = app.buttons["\(date), Dinner: Add meal"]
        revealOnBoard(add, in: app)
        XCTAssertTrue(add.isHittable)
        add.tap()
        XCTAssertTrue(app.navigationBars["Add meal"].waitForExistence(timeout: 15))
        let title = date == "2026-10-19" ? fixture.title : "\(fixture.title) · \(date)"
        if date == "2026-10-19" {
            app.segmentedControls.buttons["Saved meal"].tap()
            let recipe = app.buttons[fixture.title]
            XCTAssertTrue(recipe.waitForExistence(timeout: 30))
            recipe.tap()
            let instructions = app.staticTexts["Simmer the fictional ingredients."]
            revealInSheet(instructions, in: app)
            XCTAssertTrue(instructions.isHittable)
        } else {
            let input = app.textFields["What are you having?"]
            XCTAssertTrue(input.isHittable)
            input.tap()
            input.typeText(title)
            XCTAssertEqual(input.value as? String, title)
        }
        let save = app.navigationBars["Add meal"].buttons["Save"]
        XCTAssertTrue(save.isEnabled && save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.height + 0.000_001, 44)
        save.tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Add meal"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        let meal = app.buttons["\(date), Dinner: \(title), recipe details"]
        revealOnBoard(meal, in: app)
        XCTAssertTrue(meal.exists)
        XCTAssertFalse(app.buttons["\(date), Dinner: Add meal"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func returnToWeekNavigation(in app: XCUIApplication) {
        for _ in 0..<30 {
            let next = app.buttons["Next week"]
            if next.isHittable && next.frame.minY >= 80 { return }
            app.scrollViews.firstMatch.swipeDown(velocity: .slow)
        }
        XCTFail("The meal-week navigation is not visible after returning from the library")
    }

    private func openOwnedWeek(in app: XCUIApplication) {
        let heading = app.staticTexts["19 Oct – 25 Oct"]
        for _ in 0..<4 {
            if heading.exists { return }
            let next = app.buttons["Next week"]
            XCTAssertTrue(next.isHittable)
            let previous = app.staticTexts.matching(
                NSPredicate(format: "label MATCHES %@", "[0-9]+ Oct – [0-9]+ Oct")
            ).firstMatch.label
            next.tap()
            let changed = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false"), object: app.staticTexts[previous])
            XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
        }
        XCTFail("The real device week did not reach the reserved fixture week")
    }

    private func revealOnBoard(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<30 {
            let bottom = app.tabBars.firstMatch.frame.minY
            if element.isHittable && element.frame.minY >= 80 && element.frame.maxY <= bottom { return }
            let frame = element.exists ? element.frame : .zero
            if frame.height > 0 && frame.minY < 80 {
                app.scrollViews.firstMatch.swipeDown(velocity: .slow)
            } else {
                app.scrollViews.firstMatch.swipeUp(velocity: .slow)
            }
        }
        XCTFail("The exact fixture meal control is not visible")
    }

    private func revealInSheet(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<20 {
            if element.isHittable && element.frame.minY >= 80 && element.frame.maxY <= app.frame.maxY - 60 { return }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.35))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Saved recipe instructions are not readable before confirming the meal")
    }
}
