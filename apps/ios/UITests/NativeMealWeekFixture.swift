import XCTest

@MainActor
struct NativeMealWeekFixture {
    let title = "Nest native manual week 20261005"
    let name: String

    init(action: String) throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_MANUAL_WEEK"] == "20261005",
                environment["NEST_QA_MANUAL_WEEK_ACTION"] == action
            else { throw XCTSkip("Requires the exact explicitly prepared native meal action.") }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            name = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            XCTAssertEqual(environment["NEST_QA_MANUAL_WEEK_NAME"], name)
        #else
            throw XCTSkip("Fictional native meal fixtures are forbidden on physical phones.")
        #endif
    }

    func openMeals() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        if app.staticTexts["Welcome, \(name)."].exists { app.buttons["Get started"].tap() }
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tabs.buttons["Meals"].tap()
        return app
    }

    func openLibrary() -> XCUIApplication {
        let app = openMeals()
        let library = app.buttons["Saved meals"]
        revealLibrary(library, in: app)
        XCTAssertTrue(library.isHittable)
        library.tap()
        XCTAssertTrue(app.navigationBars["Saved meals"].waitForExistence(timeout: 15))
        return app
    }

    private func revealLibrary(_ library: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<60 {
            if library.isHittable && library.frame.minY >= 80
                && library.frame.maxY <= app.tabBars.firstMatch.frame.minY
            {
                return
            }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.8))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.3))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("The bottom-of-week saved-meal library is not visible")
    }

    func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<40 {
            let frame = element.exists ? element.frame : .zero
            let bottom =
                app.navigationBars["New recipe"].exists
                ? app.frame.maxY - 60 : app.tabBars.firstMatch.frame.minY
            if element.isHittable && frame.minY >= 80 && frame.maxY <= bottom { return }
            let distance = element.exists ? max(-300, min(300, frame.minY - 130)) : 250
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Required native meal control is not visible")
    }

    func returnToRecipeStart(_ name: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<25 {
            if name.isHittable && name.frame.minY >= 80 { return }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.35))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.96, dy: 0.8))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Recipe name is not visible after returning to the start of the form")
    }

    func finish(_ app: XCUIApplication) {
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
