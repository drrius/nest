import XCTest

@MainActor
final class NativeMealsContrastViewportTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testMealsTuesdayContrastWithHeadingAboveTabBar() throws {
        try authorized()
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        defer { restoreToday(app) }
        app.tabBars.firstMatch.buttons["Meals"].tap()
        XCTAssertTrue(app.staticTexts["5 Oct – 11 Oct"].waitForExistence(timeout: 30))
        let heading = app.staticTexts["Tuesday · 6 Oct"]
        try position(heading, in: app)
        XCTAssertEqual(app.staticTexts.matching(identifier: "Tuesday · 6 Oct").count, 1)
        XCTAssertEqual(heading.label, "Tuesday · 6 Oct")
        capture(app, name: "Exact Tuesday heading fully visible eighty points above tab bar")
        attach(
            ["auditType": "contrast", "auditInvocations": 1, "filteredFindings": 0, "hostedCommands": 0],
            name: "One unfiltered Meals contrast audit")
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .contrast, test: self)
    }

    private func position(_ heading: XCUIElement, in app: XCUIApplication) throws {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let bar = app.tabBars.firstMatch.frame
            let frame = heading.exists ? heading.frame : .zero
            let scrolls = app.scrollViews.allElementsBoundByIndex.filter { $0.isHittable }
            XCTAssertEqual(scrolls.count, 1)
            let scroll = try XCTUnwrap(scrolls.first)
            let point = CGPoint(x: app.frame.width * 0.04, y: app.frame.height * 0.65)
            XCTAssertTrue(scroll.frame.contains(point))
            frames.append([
                "label": "Tuesday · 6 Oct", "exists": heading.exists, "frame": rect(frame), "tabBar": rect(bar),
                "hittable": heading.isHittable, "scroll": rect(scroll.frame), "gestureStart": [point.x, point.y],
            ])
            if heading.exists && heading.isHittable && app.frame.contains(frame) && frame.minY >= 80
                && frame.maxY <= bar.minY - 80
            {
                attach(frames, name: "Measured Tuesday viewport placement")
                return
            }
            if frame.height > bar.minY - 160 {
                attach(frames, name: "Impossible Tuesday viewport geometry")
                throw MealsPlacementFailure.impossible
            }
            let delta = frame.isEmpty ? 180 : (frame.minY < 80 ? frame.minY - 100 : frame.maxY - bar.minY + 100)
            let sign: CGFloat = delta < 0 ? -1 : 1
            let distance = sign * min(180, max(80, abs(delta)))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(frames, name: "Unsuccessful Tuesday viewport placement")
        capture(app, name: "Tuesday viewport placement failure before any audit")
        throw MealsPlacementFailure.unsettled
    }

    private func authorized() throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_MEALS_CONTRAST_VIEWPORT"] == "20261006" else {
                throw XCTSkip("Requires dated read-only fictional Meals contrast diagnosis.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_MEALS_CONTRAST_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_MEALS_CONTRAST_ACTION"], "one_unfiltered_contrast_audit")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional contrast diagnosis is forbidden on physical phones.")
        #endif
    }

    private func restoreToday(_ app: XCUIApplication) {
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Around the house"].isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        XCTAssertTrue(app.staticTexts["Today"].firstMatch.frame.minY < 180)
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        capture(app, name: "Restored Today top and original filter")
    }

    private func rect(_ frame: CGRect) -> [CGFloat] { [frame.minX, frame.minY, frame.width, frame.height] }
    private func attach(_ value: Any, name: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
        let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        item.name = name
        item.lifetime = .keepAlways
        add(item)
    }
    private func capture(_ app: XCUIApplication, name: String) {
        let shot = XCTAttachment(screenshot: app.screenshot())
        shot.name = name
        shot.lifetime = .keepAlways
        add(shot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
}

private enum MealsPlacementFailure: Error { case impossible, unsettled }
