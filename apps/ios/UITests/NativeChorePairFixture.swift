import XCTest

@MainActor
struct NativeChorePairFixture {
    let title = "Nest native chore pair 20261005"
    let name: String

    init(action: String? = nil) throws {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_CHORE_PAIR"] == "20261005" else {
                throw XCTSkip("Requires the explicitly prepared two-member native chore fixture.")
            }
            if let action, environment["NEST_QA_CHORE_PAIR_ACTION"] != action {
                throw XCTSkip("Requires explicit authorization for this exact owned chore action.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            let simulator = try XCTUnwrap(environment["SIMULATOR_UDID"])
            name = try XCTUnwrap(roles[simulator])
            guard environment["NEST_QA_CHORE_PAIR_NAME"] == name else {
                throw NativeChorePairFailure.configuration
            }
        #else
            throw XCTSkip("Fictional native pair tests are forbidden on physical phones.")
        #endif
    }

    func openToday() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        if app.staticTexts["Hi \(name). How do you want to start?"].exists {
            app.buttons["Get started"].tap()
        }
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        return app
    }

    func openRoutines() -> XCUIApplication {
        let app = openToday()
        let manage = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Manage chores")).firstMatch
        reveal(manage, in: app)
        XCTAssertTrue(manage.isHittable)
        manage.tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        return app
    }

    func openHandovers() -> XCUIApplication {
        let app = openRoutines()
        let handovers = app.buttons["Chore handovers"]
        reveal(handovers, in: app)
        handovers.tap()
        XCTAssertTrue(app.navigationBars["Chore handovers"].waitForExistence(timeout: 15))
        return app
    }

    func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<40 {
            let frame = element.exists ? element.frame : .zero
            let bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.height - 80
            if element.isHittable && frame.minY >= 40 && frame.maxY <= bottom { return }
            let distance = element.exists ? max(-80, min(80, frame.minY - 100)) : 80
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Required native chore control is not visible")
    }

    func waitForValue(_ element: XCUIElement, _ value: String) {
        let settled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", value), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
    }

    func finish(_ app: XCUIApplication, backs: Int) {
        XCTAssertTrue((0...2).contains(backs))
        for _ in 0..<backs { app.navigationBars.buttons.element(boundBy: 0).tap() }
        app.tabBars.firstMatch.buttons["Today"].tap()
        let filter = app.buttons["Me + shared"]
        if filter.exists && !filter.isSelected {
            reveal(filter, in: app)
            filter.tap()
        }
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}

enum NativeChorePairFailure: Error { case configuration }
