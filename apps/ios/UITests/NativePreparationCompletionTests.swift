import XCTest

@MainActor
final class NativePreparationCompletionTests: XCTestCase {
    private let title = "Nest native preparation 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testInspectOwnedDuePickerWithoutSaving() throws {
        let week = try open(action: "inspect_owned_preparation_date")
        XCTAssertEqual(week.fixture.name, "Test Sam")
        let tree = XCTAttachment(string: week.app.debugDescription)
        tree.name = "Owned preparation native due picker hierarchy"
        tree.lifetime = .keepAlways
        add(tree)
        let image = XCTAttachment(screenshot: week.app.screenshot())
        image.name = "Owned preparation native due picker"
        image.lifetime = .keepAlways
        add(image)
        week.app.navigationBars["Edit preparation"].buttons["Cancel"].tap()
        let discard = week.app.buttons["Discard changes"]
        XCTAssertTrue(discard.waitForExistence(timeout: 15))
        discard.tap()
        XCTAssertTrue(week.app.navigationBars["Meal preparation"].waitForExistence(timeout: 15))
        finish(week.app)
    }

    func testCompleteOwnedPreparationFromTodayOnce() throws {
        let fixture = try NativeMealWeekFixture(action: "complete_owned_preparation")
        XCTAssertEqual(fixture.name, "Test Sam")
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        let item = app.buttons[title]
        XCTAssertTrue(item.waitForExistence(timeout: 30))
        fixture.reveal(item, in: app)
        XCTAssertEqual(item.value as? String, "Due today")
        XCTAssertTrue(item.isEnabled)
        XCTAssertGreaterThanOrEqual(item.frame.height + 0.000_001, 44)
        item.tap()
        let settled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.buttons[title])
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["A saved change needs your review."].exists)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "Assigned preparation completed through Today"
        image.lifetime = .keepAlways
        add(image)
    }

    func testMoveOwnedPreparationToTodayOnce() throws {
        let week = try open(action: "move_owned_preparation_to_today")
        XCTAssertEqual(week.fixture.name, "Test Sam")
        let date = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_PREPARATION_DUE"])
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        XCTAssertEqual(date, formatter.string(from: .now))
        let picker = week.app.datePickers.firstMatch
        XCTAssertTrue(picker.exists && picker.isHittable)
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, "Oct 19, 2026")
        picker.tap()
        let tree = XCTAttachment(string: week.app.debugDescription)
        tree.name = "Native due calendar before exact day selection"
        tree.lifetime = .keepAlways
        add(tree)
        formatter.dateFormat = "EEEE, MMMM d"
        let day = week.app.buttons["Today, " + formatter.string(from: .now)]
        XCTAssertTrue(day.waitForExistence(timeout: 15))
        XCTAssertTrue(day.isHittable)
        day.tap()
        week.app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.8)).tap()
        formatter.dateFormat = "MMM d, yyyy"
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, formatter.string(from: .now))
        let save = week.app.navigationBars["Edit preparation"].buttons["Save"]
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(week.app.navigationBars["Meal preparation"].waitForExistence(timeout: 30))
        XCTAssertTrue(week.app.staticTexts["Assigned to Test Sam"].waitForExistence(timeout: 30))
        finish(week.app)
    }

    func testFinishedPreparationKeepsDateAndResponsibilityReadOnly() throws {
        let week = try open(action: "review_finished_preparation")
        XCTAssertFalse(week.app.datePickers.firstMatch.exists)
        XCTAssertFalse(
            week.app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Assignment'")).firstMatch.exists)
        XCTAssertFalse(week.app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Person'")).firstMatch.exists)
        XCTAssertTrue(
            week.app.staticTexts[
                "This task is finished. You can update its name and instructions; its date and responsibility stay the same."
            ].exists)
        XCTAssertEqual(week.app.textFields["Instructions"].value as? String, "Drain the fictional lentils.")
        XCTAssertFalse(week.app.navigationBars["Edit preparation"].buttons["Save"].isEnabled)
        let image = XCTAttachment(screenshot: week.app.screenshot())
        image.name = "Finished preparation keeps date and responsibility"
        image.lifetime = .keepAlways
        add(image)
        week.app.navigationBars["Edit preparation"].buttons["Cancel"].tap()
        XCTAssertTrue(week.app.buttons["Discard changes"].waitForExistence(timeout: 15))
        week.app.buttons["Discard changes"].tap()
        XCTAssertTrue(week.app.navigationBars["Meal preparation"].waitForExistence(timeout: 15))
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
        XCTAssertTrue(week.app.staticTexts[title].waitForExistence(timeout: 30))
        XCTAssertTrue(week.app.staticTexts["Assigned to Test Sam"].waitForExistence(timeout: 30))
        let edit = week.app.buttons["Edit preparation"]
        week.reveal(edit)
        edit.tap()
        XCTAssertTrue(week.app.navigationBars["Edit preparation"].waitForExistence(timeout: 15))
        return week
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Meal preparation"].buttons.element(boundBy: 0).tap()
        app.navigationBars["Planned meal"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
