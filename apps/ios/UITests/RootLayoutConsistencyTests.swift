import XCTest

@MainActor
final class RootLayoutConsistencyTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCalendarCardsKeepNativePickers() throws {
        _ = try NativeMealWeekFixture(action: "root_layout")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Calendar"].tap()
        let choose = app.buttons["Choose day"]
        XCTAssertTrue(choose.waitForExistence(timeout: 15))
        XCTAssertTrue(choose.isHittable)
        XCTAssertGreaterThanOrEqual(choose.frame.height + 0.000_001, 44)
        let day = choose.value as? String
        choose.tap()
        XCTAssertTrue(app.navigationBars["Choose day"].waitForExistence(timeout: 15))
        let done = app.navigationBars["Choose day"].buttons["Done"]
        XCTAssertTrue(done.isHittable)
        XCTAssertGreaterThanOrEqual(done.frame.height + 0.000_001, 44)
        done.tap()
        XCTAssertTrue(choose.waitForExistence(timeout: 15))
        XCTAssertEqual(choose.value as? String, day)
        let calendars = app.buttons["Choose calendars"].firstMatch
        if calendars.exists {
            XCTAssertTrue(calendars.isHittable)
            XCTAssertGreaterThanOrEqual(calendars.frame.height + 0.000_001, 44)
            calendars.tap()
            XCTAssertTrue(app.navigationBars["Your calendars"].waitForExistence(timeout: 15))
            let close = app.navigationBars["Your calendars"].buttons["Done"]
            XCTAssertTrue(close.isHittable)
            XCTAssertGreaterThanOrEqual(close.frame.height + 0.000_001, 44)
            close.tap()
        }
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Calendar after unchanged picker review"
        capture.lifetime = .keepAlways
        add(capture)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testFourTabsShareHeaderAlignment() throws {
        let fixture = try NativeMealWeekFixture(action: "root_layout")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts[fixture.name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        var frames: [(String, CGRect, CGRect)] = []
        for tab in ["Today", "Meals", "Calendar", "Money"] {
            app.tabBars.firstMatch.buttons[tab].tap()
            let capture = XCTAttachment(screenshot: app.screenshot())
            capture.name = "\(tab) root layout"
            capture.lifetime = .keepAlways
            add(capture)
            let title = app.navigationBars[tab].staticTexts[tab]
            let profile = app.buttons["tab-profile-action"]
            XCTAssertTrue(title.exists && profile.isHittable)
            frames.append((tab, title.frame, profile.frame))
            profile.tap()
            XCTAssertTrue(app.staticTexts[fixture.name].waitForExistence(timeout: 15))
            app.navigationBars.buttons.element(boundBy: 0).tap()
            app.tabBars.buttons["Ask Nest"].tap()
            XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 15))
            app.tabBars.firstMatch.buttons[tab].tap()
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        let data = try JSONSerialization.data(
            withJSONObject: frames.map { tab, title, profile in
                ["tab": tab, "title": values(title), "profile": values(profile)] as [String: Any]
            }, options: [.sortedKeys])
        let report = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        report.name = "Four-tab native header frames"
        report.lifetime = .keepAlways
        add(report)
        let reference = try XCTUnwrap(frames.first)
        continueAfterFailure = true
        for (tab, title, profile) in frames {
            XCTAssertEqual(title.minX, 20, accuracy: 0.5, "\(tab) title inset")
            XCTAssertEqual(title.minY, reference.1.minY, accuracy: 0.5, "\(tab) title top")
            XCTAssertEqual(profile.maxX, app.frame.maxX - 20, accuracy: 0.5, "\(tab) action inset")
            XCTAssertEqual(profile.minY, reference.2.minY, accuracy: 0.5, "\(tab) action top")
            XCTAssertGreaterThanOrEqual(profile.height + 0.000_001, 44, "\(tab) profile target")
        }
    }

    private func values(_ frame: CGRect) -> [Double] {
        [frame.minX, frame.minY, frame.width, frame.height].map(Double.init)
    }
}
