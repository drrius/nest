import XCTest

@MainActor
final class NativeContrastViewportTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testTodayContrastWithBothBoundTargetsAboveTabBar() throws {
        try authorized()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        defer { restoreToday(app) }
        let meal = app.buttons["Open meal plan"]
        let calendar = app.staticTexts["On your calendar"]
        XCTAssertTrue(meal.waitForExistence(timeout: 30))
        XCTAssertTrue(calendar.waitForExistence(timeout: 30))
        try position(meal, calendar, in: app)
        capture(app, name: "Both original contrast targets clear of tab bar")
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .contrast, test: self)
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_CONTRAST_VIEWPORT"] == "20261006" else {
                throw XCTSkip("Requires the dated read-only fictional Today contrast diagnosis.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("This fictional diagnostic is forbidden on physical phones.")
        #endif
    }

    private func position(_ first: XCUIElement, _ last: XCUIElement, in app: XCUIApplication) throws {
        var observations: [[String: Any]] = []
        for _ in 0..<30 {
            let bar = app.tabBars.firstMatch.frame
            let a = first.frame
            let b = last.frame
            observations.append([
                "meal": rect(a), "calendar": rect(b), "tabBar": rect(bar),
                "mealHittable": first.isHittable, "calendarHittable": last.isHittable,
            ])
            if first.isHittable && last.isHittable && a.minY >= 80 && b.minY >= 80
                && a.maxY <= bar.minY - 40 && b.maxY <= bar.minY - 40
            {
                attach(observations, name: "Measured two-target viewport placement")
                return
            }
            if b.maxY - a.minY > bar.minY - 120 {
                attach(observations, name: "Impossible two-target viewport geometry")
                capture(app, name: "Two-target placement geometry failure")
                throw PlacementFailure.impossible
            }
            let delta = a.minY < 80 ? a.minY - 100 : b.maxY - (bar.minY - 80)
            let distance = max(-100, min(100, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let destination = app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: destination, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(observations, name: "Unsuccessful measured two-target viewport placement")
        capture(app, name: "Two-target placement failure")
        throw PlacementFailure.unsettled
    }

    private func rect(_ frame: CGRect) -> [CGFloat] {
        [frame.minX, frame.minY, frame.width, frame.height]
    }

    private func attach(_ value: Any, name: String) {
        if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = name
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }

    private func restoreToday(_ app: XCUIApplication) {
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Around the house"].isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isHittable)
        XCTAssertTrue(app.staticTexts["Today"].firstMatch.frame.minY < 180)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        capture(app, name: "Restored Today top and original filter")
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

private enum PlacementFailure: Error { case impossible, unsettled }
