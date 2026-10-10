import XCTest

@MainActor
final class NativeRenewalOfflineViewTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testRealCachedEmptyListSurvivesUnavailableReadAndColdRestart() throws {
        let name = try authorized()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        try openRenewals(app, name: name)
        XCTAssertTrue(app.staticTexts["No renewals yet."].waitForExistence(timeout: 30))
        XCTAssertFalse(savedNotice(app).exists)
        capture(app, name: "Real API empty renewal list before unavailable reads")
        let refresh = app.buttons["Refresh"]
        waitEnabled(refresh)
        refresh.tap()
        let notice = savedNotice(app)
        XCTAssertTrue(notice.waitForExistence(timeout: 30))
        let captured = notice.label
        XCTAssertTrue(captured.contains("Refresh when online."))
        XCTAssertTrue(app.staticTexts["No renewals yet."].exists)
        capture(app, name: "Cached empty renewal list after unavailable Refresh")
        app.terminate()
        app.launch()
        try openRenewals(app, name: name)
        XCTAssertTrue(savedNotice(app).waitForExistence(timeout: 30))
        XCTAssertEqual(savedNotice(app).label, captured)
        XCTAssertTrue(app.staticTexts["No renewals yet."].exists)
        capture(app, name: "Persisted empty renewal list after cold app restart")
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        capture(app, name: "Returned to Today after read-only cache verification")
    }

    private func authorized() throws -> String {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RENEWAL_OFFLINE_UI"] == "20261006" else {
                throw XCTSkip("Requires the dated read-only fictional renewal UI run.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            let name = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_RENEWAL_NAME"], name)
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://localhost:4662")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            return name
        #else
            throw XCTSkip("The loopback fictional cache test is forbidden on physical phones.")
        #endif
    }

    private func openRenewals(_ app: XCUIApplication, name: String) throws {
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()  // Renewals live under Money → Bills & renewals.
        let link = app.buttons["Manage renewals"]
        for _ in 0..<12 {
            if link.isHittable && link.frame.maxY < app.tabBars.firstMatch.frame.minY { break }
            app.swipeUp(velocity: .slow)
        }
        XCTAssertTrue(link.isHittable)
        link.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        waitEnabled(app.buttons["Refresh"])
    }

    private func savedNotice(_ app: XCUIApplication) -> XCUIElement {
        app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Saved information from ")).firstMatch
    }

    private func waitEnabled(_ element: XCUIElement) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
}
