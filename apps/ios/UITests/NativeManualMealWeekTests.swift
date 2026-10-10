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
        let input = app.textFields["Search or type a meal"]
        XCTAssertTrue(input.waitForExistence(timeout: 15))
        let navigation = app.navigationBars.matching(NSPredicate(format: "identifier ENDSWITH %@", " dinner"))
            .firstMatch
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        let title = date == "2026-10-19" ? fixture.title : "\(fixture.title) · \(date)"
        input.tap()
        input.typeText(title)
        XCTAssertEqual(input.value as? String, title)
        if date == "2026-10-19" {
            let recipe = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
            XCTAssertTrue(recipe.waitForExistence(timeout: 30))
            recipe.tap()
            let selected = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "value == %@", "Selected"), object: recipe)
            XCTAssertEqual(XCTWaiter.wait(for: [selected], timeout: 30), .completed)
        } else {
            let add = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Add “\(title)”")).firstMatch
            XCTAssertTrue(add.waitForExistence(timeout: 15))
            add.tap()
        }
        let save = navigation.buttons["Save"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        XCTAssertTrue(save.isEnabled && save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.height + 0.000_001, 44)
        save.tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: input)
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
        let heading = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "19 Oct – 25 Oct")).firstMatch
        for _ in 0..<4 {
            if heading.exists { return }
            let next = app.buttons["Next week"]
            XCTAssertTrue(next.isHittable)
            let previous = app.staticTexts.matching(
                NSPredicate(format: "label MATCHES %@", ".*[0-9]+ Oct – [0-9]+ Oct.*")
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
}
