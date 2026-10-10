import XCTest

@MainActor
final class FictionalAccountSignOutTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testVerifiedFictionalPartnerOpensHousehold() throws {
        let name = try requireFixture()
        XCTAssertEqual(name, "Test Sam")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        if app.staticTexts["Welcome, Test Sam."].waitForExistence(timeout: 10) {
            app.buttons["Get started"].tap()
            XCTAssertFalse(app.staticTexts["Welcome, Test Sam."].exists)
        }
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(tabs.buttons["Today"].isSelected)
    }

    func testSignOutVerifiedFictionalAccount() throws {
        let name = try requireFixture()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        tabs.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        let signOut = app.buttons["Sign out on this device"]
        for _ in 0..<12 {
            if signOut.isHittable { break }
            app.swipeUp()
        }
        XCTAssertTrue(signOut.isHittable)
        signOut.tap()
        let confirm = app.buttons["Sign out"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        confirm.tap()
        XCTAssertTrue(app.buttons["Sign in with Apple"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.tabBars.firstMatch.exists)
    }

    private func requireFixture() throws -> String {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_SIGN_OUT_FIXTURE"] == "20261005" else {
                throw XCTSkip("Requires explicit fictional-account setup and empty journals.")
            }
            let name = try XCTUnwrap(environment["NEST_QA_SIGN_OUT_NAME"])
            XCTAssertTrue(["Test Alex", "Test Sam"].contains(name))
            XCTAssertEqual(environment["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            return name
        #else
            throw XCTSkip("Fictional-account setup is forbidden on physical devices.")
        #endif
    }
}
