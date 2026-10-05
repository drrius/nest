import XCTest

@MainActor
final class NativeGroceryPairTests: XCTestCase {
    private let fixture = "Nest native pair grocery 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testVerifiedMemberOpensSharedChecklist() throws {
        let app = try openGroceries()
        XCTAssertTrue(app.buttons["Add grocery"].exists)
        XCTAssertTrue(app.buttons["Record grocery expense"].exists)
        finish(app)
    }

    func testCreateOwnedGroceryOnce() throws {
        try requireMutation("create")
        let app = try openGroceries()
        XCTAssertFalse(app.buttons[fixture].exists)
        app.buttons["Add grocery"].tap()
        let name = app.textFields["Grocery name"]
        XCTAssertTrue(name.waitForExistence(timeout: 15))
        name.tap()
        name.typeText(fixture)
        let add = app.buttons["Add"]
        XCTAssertTrue(add.isEnabled)
        add.tap()
        XCTAssertTrue(app.buttons[fixture].waitForExistence(timeout: 30))
        XCTAssertEqual(app.buttons[fixture].value as? String, "To pick up")
        let dismissed = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.navigationBars["Add grocery"])
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 15), .completed)
        finish(app)
    }

    func testReadOwnedGroceryState() throws {
        let expected = try expectedState()
        let app = try openGroceries()
        let item = revealFixture(in: app)
        XCTAssertTrue(item.exists)
        XCTAssertEqual(item.value as? String, expected)
        finish(app)
    }

    func testCheckOwnedGroceryOnce() throws {
        try requireMutation("check")
        let expected = try expectedState()
        let app = try openGroceries()
        let item = revealFixture(in: app)
        XCTAssertTrue(item.isHittable)
        XCTAssertTrue(item.isEnabled)
        let before = ProcessInfo.processInfo.environment["NEST_QA_NATIVE_PAIR_FROM"] ?? "To pick up"
        XCTAssertTrue(["To pick up", "Picked up"].contains(before))
        XCTAssertEqual(item.value as? String, before)
        item.tap()
        if expected == "Picked up" {
            let moved = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false OR value == %@", expected),
                object: app.buttons[fixture])
            XCTAssertEqual(XCTWaiter.wait(for: [moved], timeout: 30), .completed)
            if !app.buttons[fixture].exists { revealPickedUp(in: app) }
        }
        let settled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", expected), object: app.buttons[fixture])
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
        finish(app)
    }

    func testDiscardOwnedGroceryConflict() throws {
        try requireMutation("discard")
        let app = try openGroceries()
        let item = revealFixture(in: app)
        XCTAssertEqual(item.value as? String, "To pick up, conflict")
        XCTAssertTrue(app.staticTexts["Saved change: Picked up"].exists)
        let discard = app.buttons["Discard saved change"]
        reveal(discard, in: app)
        XCTAssertTrue(discard.isHittable)
        discard.tap()
        let settled = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", "To pick up"), object: app.buttons[fixture])
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["Needs review"].exists)
        finish(app)
    }

    func testRemoveOwnedGroceryOnce() throws {
        try requireMutation("remove")
        let app = try openGroceries()
        _ = revealFixture(in: app)
        let more = app.buttons["More options for \(fixture)"]
        reveal(more, in: app)
        XCTAssertTrue(more.isHittable)
        more.tap()
        let remove = app.buttons["Remove"]
        XCTAssertTrue(remove.waitForExistence(timeout: 15))
        remove.tap()
        let confirm = app.buttons["Remove \(fixture)"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        confirm.tap()
        let absent = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.buttons[fixture])
        XCTAssertEqual(XCTWaiter.wait(for: [absent], timeout: 30), .completed)
        XCTAssertFalse(app.buttons["Retry saved removal"].exists)
        finish(app)
    }

    private func openGroceries() throws -> XCUIApplication {
        let name = try requireFixture()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        if app.staticTexts["Welcome, \(name)."].waitForExistence(timeout: 5) {
            app.buttons["Get started"].tap()
        }
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let groceries = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Groceries")).firstMatch
        reveal(groceries, in: app)
        XCTAssertTrue(groceries.isHittable)
        groceries.tap()
        XCTAssertTrue(app.navigationBars["Groceries"].waitForExistence(timeout: 15))
        return app
    }

    private func revealFixture(in app: XCUIApplication) -> XCUIElement {
        if !app.buttons[fixture].exists { revealPickedUp(in: app) }
        let item = app.buttons[fixture]
        reveal(item, in: app)
        return item
    }

    private func revealPickedUp(in app: XCUIApplication) {
        let group = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Picked up · ")).firstMatch
        if group.waitForExistence(timeout: 15) {
            reveal(group, in: app)
            if !app.buttons[fixture].exists { group.tap() }
        }
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<40 {
            let frame = element.exists ? element.frame : .zero
            if element.isHittable && frame.minY >= 40 && frame.maxY <= app.tabBars.firstMatch.frame.minY {
                return
            }
            let distance = element.exists ? max(-80, min(80, frame.minY - 100)) : 80
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Required native grocery control is not visible")
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func expectedState() throws -> String {
        _ = try requireFixture()
        let value = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_NATIVE_PAIR_STATE"])
        XCTAssertTrue(["To pick up", "Picked up", "Picked up, pending", "To pick up, conflict"].contains(value))
        return value
    }

    private func requireMutation(_ action: String) throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_NATIVE_PAIR_ACTION"] == action else {
            throw XCTSkip("Requires explicit authorization for this exact owned grocery action.")
        }
        _ = try requireFixture()
    }

    private func requireFixture() throws -> String {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_NATIVE_PAIR"] == "20261005" else {
                throw XCTSkip("Requires the isolated, explicitly prepared two-member native fixture.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            let simulator = try XCTUnwrap(environment["SIMULATOR_UDID"])
            let name = try XCTUnwrap(roles[simulator])
            XCTAssertEqual(environment["NEST_QA_NATIVE_PAIR_NAME"], name)
            return name
        #else
            throw XCTSkip("Fictional native pair tests are forbidden on physical devices.")
        #endif
    }
}
