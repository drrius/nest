import XCTest

@MainActor
final class NativeManualMealMoveTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testMoveOwnedTuesdayMealOnce() throws {
        let fixture = try NativeMealWeekFixture(action: "move_slot")
        XCTAssertEqual(fixture.name, "Test Alex")
        let destination = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_MANUAL_WEEK_DESTINATION"])
        XCTAssertTrue(["Lunch", "Dinner"].contains(destination))
        let source = destination == "Lunch" ? "Dinner" : "Lunch"
        let title = "\(fixture.title) · 2026-10-20"
        let app = fixture.openLibrary()
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        returnToWeekNavigation(in: app)
        openOwnedWeek(in: app)
        let options = app.buttons["2026-10-20, \(source): More options for \(title)"]
        reveal(options, in: app)
        XCTAssertTrue(options.isEnabled && options.isHittable)
        options.tap()
        let move = app.buttons["Move"]
        XCTAssertTrue(move.waitForExistence(timeout: 10))
        move.tap()
        let navigation = app.navigationBars["Move meal"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Meal,")).firstMatch
        XCTAssertTrue(picker.isHittable)
        picker.tap()
        let choice = app.buttons[destination]
        XCTAssertTrue(choice.waitForExistence(timeout: 10))
        choice.tap()
        let save = navigation.buttons["Move"]
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 30), .completed)
        XCTAssertTrue(save.isHittable)
        XCTAssertGreaterThanOrEqual(save.frame.height + 0.000_001, 44)
        save.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: navigation)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        let moved = app.buttons["2026-10-20, \(destination): \(title), recipe details"]
        reveal(moved, in: app)
        XCTAssertTrue(moved.isHittable)
        XCTAssertFalse(app.buttons["2026-10-20, \(source): \(title), recipe details"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func returnToWeekNavigation(in app: XCUIApplication) {
        for _ in 0..<30 {
            let next = app.buttons["Next week"]
            if next.isHittable && next.frame.minY >= 80 { return }
            app.scrollViews.firstMatch.swipeDown(velocity: .slow)
        }
        XCTFail("The reserved meal-week navigation is not visible")
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
        XCTFail("The real device week did not reach the reserved fixture")
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
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
        XCTFail("The exact reserved Tuesday meal control is not visible")
    }
}
