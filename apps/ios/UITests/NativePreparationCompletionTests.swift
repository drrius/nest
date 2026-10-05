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
        waitForEditorDismissal(week.app)
        XCTAssertFalse(week.app.staticTexts["Discard preparation changes?"].exists)
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
            predicate: NSPredicate(format: "exists == false"), object: app.descendants(matching: .any)[title])
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["A saved change needs your review."].exists)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = "Assigned preparation completed through Today"
        image.lifetime = .keepAlways
        add(image)
    }

    func testCompletedPreparationDoesNotReappearAfterRestart() throws {
        let fixture = try NativeMealWeekFixture(action: "read_completed_preparation_today")
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Everyone"].tap()
        XCTAssertTrue(app.buttons["Hosted smoke tidy kitchen"].waitForExistence(timeout: 30))
        let absent = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.descendants(matching: .any)[title])
        XCTAssertEqual(XCTWaiter.wait(for: [absent], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["Saved. This will sync when online."].exists)
        XCTAssertFalse(app.staticTexts["A saved change needs your review."].exists)
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = fixture.name + " completed preparation stays absent after restart"
        image.lifetime = .keepAlways
        add(image)
        app.buttons["Me + shared"].tap()
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
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
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: week.app.navigationBars["Edit preparation"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
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
        waitForEditorDismissal(week.app)
        XCTAssertFalse(week.app.staticTexts["Discard preparation changes?"].exists)
        XCTAssertTrue(week.app.navigationBars["Meal preparation"].waitForExistence(timeout: 15))
        finish(week.app)
    }

    func testFinishedPreparationExplanationRemainsReadable() throws {
        let week = try open(action: "review_finished_preparation_text")
        let app = week.app
        let text = app.staticTexts[
            "This task is finished. You can update its name and instructions; its date and responsibility stay the same."
        ]
        let top = app.navigationBars["Edit preparation"].frame.maxY + 8
        let bottom = app.frame.maxY - 24
        reveal(text, in: app, top: top, bottom: bottom, start: true)
        let first = text.frame
        capture("Finished preparation explanation beginning", app: app)
        reveal(text, in: app, top: top, bottom: bottom, start: false)
        let last = text.frame
        capture("Finished preparation explanation ending", app: app)
        XCTAssertEqual(first.height, last.height, accuracy: 0.5)
        let firstCovered = min(first.height, bottom - first.minY)
        let lastCovered = min(last.height, last.maxY - top)
        XCTAssertGreaterThanOrEqual(firstCovered + lastCovered, first.height)
        let bounds = XCTAttachment(
            data: try JSONSerialization.data(
                withJSONObject: [
                    "first": [first.minX, first.minY, first.width, first.height],
                    "last": [last.minX, last.minY, last.width, last.height],
                    "viewport": [top, bottom], "firstCovered": firstCovered, "lastCovered": lastCovered,
                ], options: [.sortedKeys]), uniformTypeIdentifier: "public.json")
        bounds.name = "Finished preparation explanation reading bounds"
        bounds.lifetime = .keepAlways
        add(bounds)
        let instructions = app.textFields["Instructions"]
        reveal(instructions, in: app, top: top, bottom: bottom, start: true)
        XCTAssertTrue(instructions.isHittable)
        let original = instructions.value as? String
        instructions.tap()
        instructions.typeText("x")
        XCTAssertNotEqual(instructions.value as? String, original)
        app.buttons["Done"].tap()
        let cancel = app.navigationBars["Edit preparation"].buttons["Cancel"]
        XCTAssertTrue(cancel.isHittable)
        XCTAssertGreaterThanOrEqual(cancel.frame.height + 0.000_001, 44)
        cancel.tap()
        let heading = app.staticTexts["Discard preparation changes?"]
        XCTAssertTrue(heading.waitForExistence(timeout: 15))
        XCTAssertGreaterThanOrEqual(heading.frame.minY, 40)
        XCTAssertLessThanOrEqual(heading.frame.maxY, bottom)
        for title in ["Discard changes", "Keep editing"] {
            let button = app.buttons[title]
            XCTAssertTrue(button.isHittable)
            XCTAssertGreaterThanOrEqual(button.frame.height + 0.000_001, 44)
            XCTAssertLessThanOrEqual(button.frame.maxY, app.frame.maxY - 8)
        }
        capture("Finished preparation discard choices", app: app)
        app.buttons["Discard changes"].tap()
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Edit preparation"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        finish(app)
    }

    private func reveal(_ text: XCUIElement, in app: XCUIApplication, top: CGFloat, bottom: CGFloat, start: Bool) {
        for _ in 0..<35 {
            let frame = text.frame
            let distance = start ? frame.minY - (top + 16) : frame.maxY - (bottom - 16)
            if start ? frame.minY >= top && frame.minY < bottom - 40 : frame.maxY <= bottom && frame.maxY > top + 40 {
                return
            }
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.65))
            let target = app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.96, dy: 0.65 - max(-180, min(180, distance)) / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: target, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Finished preparation explanation boundary is not visible")
    }

    private func capture(_ name: String, app: XCUIApplication) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
    }

    private func waitForEditorDismissal(_ app: XCUIApplication) {
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Edit preparation"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
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
