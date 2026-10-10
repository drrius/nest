import XCTest

@MainActor
final class ReduceMotionNavigationTests: XCTestCase {
    func testFourTabsAndNativeDestinationsWithReduceMotionEnabled() throws {
        let fixture = try NativeMealWeekFixture(action: "reduce_motion")
        continueAfterFailure = false
        let settings = XCUIApplication(bundleIdentifier: "com.apple.Preferences")
        settings.launch()
        let accessibility = settings.descendants(matching: .any).matching(
            NSPredicate(format: "label == %@", "Accessibility")
        ).firstMatch
        reveal(accessibility, app: settings)
        accessibility.tap()
        let motion = settings.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Motion"))
            .firstMatch
        reveal(motion, app: settings)
        motion.tap()
        let reduce = settings.switches["Reduce Motion"]
        XCTAssertTrue(reduce.waitForExistence(timeout: 15))
        let original = try XCTUnwrap(reduce.value as? String)
        XCTAssertTrue(original == "0" || original == "1")
        defer {
            settings.activate()
            if original == "0", reduce.value as? String == "1" { reduce.tap() }
            waitForValue(original, switch: reduce)
        }
        if original == "0" { reduce.tap() }
        waitForValue("1", switch: reduce)
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        for tab in ["Today", "Meals", "Calendar", "Money"] {
            app.tabBars.firstMatch.buttons[tab].tap()
            XCTAssertTrue(app.tabBars.firstMatch.buttons[tab].isSelected)
            let title = app.navigationBars[tab].staticTexts[tab]
            XCTAssertTrue(title.waitForExistence(timeout: 15))
            let profile = app.buttons["tab-profile-action"]
            XCTAssertTrue(profile.isHittable)
            profile.tap()
            XCTAssertTrue(app.staticTexts[fixture.name].waitForExistence(timeout: 15))
            app.navigationBars.buttons.element(boundBy: 0).tap()
            app.tabBars.buttons["Ask Nest"].tap()
            XCTAssertTrue(app.navigationBars["Ask Nest"].waitForExistence(timeout: 15))
            app.tabBars.firstMatch.buttons[tab].tap()
            XCTAssertTrue(title.waitForExistence(timeout: 15))
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Today after Reduce Motion navigation"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func waitForValue(_ value: String, switch control: XCUIElement) {
        let predicate = NSPredicate(format: "value == %@", value)
        let expected = XCTNSPredicateExpectation(predicate: predicate, object: control)
        XCTAssertEqual(XCTWaiter.wait(for: [expected], timeout: 10), .completed)
    }

    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<12 {
            if element.exists, element.isHittable { return }
            app.swipeUp()
        }
        XCTFail("Required iOS accessibility setting is unavailable")
    }
}
