import XCTest

@MainActor
struct NativeOwnedMealWeek {
    let fixture: NativeMealWeekFixture
    let app: XCUIApplication

    init(action: String) throws {
        fixture = try NativeMealWeekFixture(action: action)
        app = fixture.openLibrary()
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        for _ in 0..<30 {
            let next = app.buttons["Next week"]
            if next.isHittable && next.frame.minY >= 80 { break }
            app.scrollViews.firstMatch.swipeDown(velocity: .slow)
        }
        for _ in 0..<4 {
            if app.staticTexts["19 Oct – 25 Oct"].exists { return }
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
        XCTFail("The real device week did not reach the reserved fixture")
    }

    func reveal(_ element: XCUIElement) {
        for _ in 0..<35 {
            let bottom = app.tabBars.firstMatch.frame.minY
            if element.isHittable && element.frame.minY >= 80 && element.frame.maxY <= bottom { return }
            let frame = element.exists ? element.frame : .zero
            if frame.height > 0 && frame.minY < 80 {
                app.scrollViews.firstMatch.swipeDown(velocity: .slow)
            } else {
                app.scrollViews.firstMatch.swipeUp(velocity: .slow)
            }
        }
        XCTFail("The exact reserved meal-week control is not visible")
    }

    func openIngredientReview() {
        let review = app.buttons["Review ingredients"]
        reveal(review)
        review.tap()
        XCTAssertTrue(app.navigationBars["Review ingredients"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Week of 2026-10-19"].waitForExistence(timeout: 30))
    }

    func finishIngredientReview() {
        app.navigationBars["Review ingredients"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
