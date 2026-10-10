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
        let calendar = app.buttons["Open Calendar"]
        XCTAssertTrue(meal.waitForExistence(timeout: 30))
        XCTAssertTrue(calendar.waitForExistence(timeout: 30))
        try position(meal, calendar, in: app)
        capture(app, name: "Both original contrast targets clear of tab bar")
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .contrast, test: self)
    }

    func testTodayCalendarAccessCardContrastClearOfNavigationAndTabBar() throws {
        try authorized()
        XCTAssertEqual(
            ProcessInfo.processInfo.environment["NEST_QA_TODAY_CALENDAR_CARD_CONTRAST"],
            "20261006-one-unfiltered-audit")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        defer { restoreToday(app) }
        XCTAssertTrue(app.staticTexts["Tuesday, October 6"].waitForExistence(timeout: 15))
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let heading = app.buttons["Open Calendar"]
        let explanation = app.staticTexts[
            "See your day here. Your event details stay on this iPhone."]
        let action = app.buttons.containing(
            .staticText, identifier: "See your day here. Your event details stay on this iPhone."
        ).firstMatch
        try positionCalendarCard([heading, explanation, action], action: action, in: app)
        XCTAssertTrue(action.isEnabled && action.isHittable)
        XCTAssertGreaterThanOrEqual(action.frame.width, 44)
        XCTAssertGreaterThanOrEqual(action.frame.height, 44)
        capture(app, name: "Whole Calendar access card eighty points above tab bar")
        attach(
            [
                "singleUnfilteredContrastAudit": true, "calendarActionTapped": false,
                "domainMutationInvoked": false,
            ],
            name: "Calendar card contrast audit invocation")
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .contrast, test: self)
    }

    private func positionCalendarCard(
        _ targets: [XCUIElement], action: XCUIElement, in app: XCUIApplication
    ) throws {
        var observations: [[String: Any]] = []
        for attempt in 0..<24 {
            let viewport = calendarAuditViewport(app)
            let realized = targets.allSatisfy { $0.exists }
            let frames = targets.map { $0.exists ? $0.frame : .zero }
            observations.append([
                "attempt": attempt, "viewport": rect(viewport),
                "navigation": app.navigationBars.firstMatch.exists ? rect(app.navigationBars.firstMatch.frame) : [],
                "tabBar": rect(app.tabBars.firstMatch.frame),
                "targets": zip(targets, frames).map {
                    [
                        "label": $0.0.exists ? $0.0.label : "unrealized", "exists": $0.0.exists,
                        "hittable": $0.0.isHittable, "frame": rect($0.1),
                    ] as [String: Any]
                },
            ])
            if realized && frames.allSatisfy({ viewport.contains($0) })
                && targets.allSatisfy({ $0.isHittable })
            {
                attach(observations, name: "Measured complete Calendar card placement")
                return
            }
            if realized && frames.map(\.maxY).max()! - frames.map(\.minY).min()! > viewport.height {
                attach(observations, name: "Calendar card cannot fit measured viewport")
                capture(app, name: "Calendar card impossible placement")
                throw PlacementFailure.impossible
            }
            let distance = calendarCardTravel(frames, realized: realized, viewport: viewport)
            try panCalendarCard(distance, in: app, viewport: viewport, action: action)
        }
        attach(observations, name: "Bounded Calendar card placement failure")
        capture(app, name: "Calendar card placement failed before audit")
        throw PlacementFailure.unsettled
    }

    private func calendarAuditViewport(_ app: XCUIApplication) -> CGRect {
        let navigation = app.navigationBars.firstMatch
        let top = navigation.exists ? max(app.frame.minY, navigation.frame.maxY) : app.frame.minY
        let bottom = app.tabBars.firstMatch.frame.minY - 80
        XCTAssertGreaterThan(bottom, top)
        return CGRect(x: app.frame.minX, y: top, width: app.frame.width, height: bottom - top)
    }

    private func calendarCardTravel(_ frames: [CGRect], realized: Bool, viewport: CGRect) -> CGFloat {
        guard realized else { return 220 }
        let top = frames.map(\.minY).min()!
        let bottom = frames.map(\.maxY).max()!
        let delta = top < viewport.minY ? top - viewport.minY : bottom - viewport.maxY
        return delta < 0 ? max(-220, min(-20, delta)) : min(220, max(20, delta))
    }

    private func panCalendarCard(
        _ distance: CGFloat, in app: XCUIApplication, viewport: CGRect, action: XCUIElement
    ) throws {
        let scrolls = app.scrollViews.allElementsBoundByIndex.filter { $0.exists }
        XCTAssertEqual(scrolls.count, 1)
        let scroller = try XCTUnwrap(scrolls.first)
        let usable = CGRect(
            x: viewport.minX, y: viewport.minY, width: viewport.width,
            height: app.tabBars.firstMatch.frame.minY - viewport.minY)
        let actions = app.buttons.allElementsBoundByIndex.filter {
            $0.exists && $0.frame.intersects(usable)
        }.map(\.frame)
        let leftmostAction = actions.map(\.minX).min() ?? usable.maxX
        let x = min(app.frame.minX + 24, leftmostAction - 4)
        XCTAssertGreaterThanOrEqual(x, app.frame.minX + 4)
        let startY = distance > 0 ? usable.maxY - 30 : usable.minY + 30
        let endY = max(usable.minY + 10, min(usable.maxY - 10, startY - distance))
        let start = CGPoint(x: x, y: startY)
        let end = CGPoint(x: x, y: endY)
        XCTAssertTrue(scroller.frame.contains(start) && scroller.frame.contains(end))
        let bars = app.otherElements.allElementsBoundByIndex.filter {
            $0.exists && $0.label.hasPrefix("Vertical scroll bar")
        }
        for bar in bars {
            XCTAssertFalse(bar.frame.contains(start) || bar.frame.contains(end))
        }
        for frame in actions {
            XCTAssertLessThan(x, frame.minX)
        }
        if action.exists {
            XCTAssertLessThan(x, action.frame.minX)
        }
        attach(
            [
                "gestureStart": [x, startY], "gestureEnd": [x, endY],
                "scroller": rect(scroller.frame), "usableViewport": rect(usable),
                "scrollBars": bars.map { rect($0.frame) }, "actionRegions": actions.map(rect),
                "action": action.exists ? rect(action.frame) : [],
            ],
            name: "Calendar card measured left-padding pan")
        let origin = app.coordinate(withNormalizedOffset: .zero)
        origin.withOffset(CGVector(dx: start.x, dy: start.y)).press(
            forDuration: 0.1, thenDragTo: origin.withOffset(CGVector(dx: end.x, dy: end.y)),
            withVelocity: .slow, thenHoldForDuration: 0.2)
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
            if app.buttons["Manage chores"].isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
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
