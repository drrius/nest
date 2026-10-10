import XCTest

@MainActor
final class CalendarReadabilityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testUnrequestedCalendarPermissionRemainsReadable() throws {
        let app = openCalendar()
        let tabs = app.tabBars.firstMatch
        let explanation = app.staticTexts[
            "Nest reads the calendars you choose. It does not create, change or delete events."]
        let elements = [
            explanation,
            app.staticTexts["iOS calls this Full Access. Nest uses it only to read your calendars."],
            app.buttons["Allow calendar access"],
        ]
        var frames: [[String: Any]] = []
        for element in elements {
            reveal(element, in: app)
            let frame = element.frame
            XCTAssertTrue(element.isHittable)
            XCTAssertGreaterThanOrEqual(frame.minY, 40)
            XCTAssertLessThanOrEqual(frame.maxY, tabs.frame.minY)
            frames.append(["label": element.label, "frame": [frame.minX, frame.minY, frame.width, frame.height]])
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Calendar permission reading"
            screenshot.lifetime = .keepAlways
            add(screenshot)
        }
        XCTAssertGreaterThanOrEqual(elements[2].frame.height, 44)
        let data = try JSONSerialization.data(withJSONObject: frames, options: [.sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "Calendar permission text bounds"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testUnknownPartnerAvailabilityCanBeReadAcrossScrolling() throws {
        let app = openCalendar()
        let text = app.staticTexts[
            "Test Sam isn’t sharing busy times for this day. Details are never shared."
        ]
        revealBoundary(text, in: app, start: true)
        let first = text.frame
        let bar = app.tabBars.firstMatch.frame
        XCTAssertGreaterThanOrEqual(first.minY, 40)
        let beginning = XCTAttachment(screenshot: app.screenshot())
        beginning.name = "Unknown availability beginning"
        beginning.lifetime = .keepAlways
        add(beginning)
        revealBoundary(text, in: app, start: false)
        let last = text.frame
        XCTAssertLessThanOrEqual(last.maxY, bar.minY)
        XCTAssertEqual(first.height, last.height, accuracy: 0.5)
        let firstCovered = min(first.height, bar.minY - first.minY)
        let lastCovered = min(last.height, last.maxY - 40)
        XCTAssertGreaterThanOrEqual(firstCovered + lastCovered, first.height)
        let ending = XCTAttachment(screenshot: app.screenshot())
        ending.name = "Unknown availability ending"
        ending.lifetime = .keepAlways
        add(ending)
        let data = try JSONSerialization.data(
            withJSONObject: [
                "first": [first.minX, first.minY, first.width, first.height],
                "last": [last.minX, last.minY, last.width, last.height],
                "usableViewport": [40, bar.minY],
                "firstCovered": firstCovered, "lastCovered": lastCovered,
            ], options: [.sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "Unknown availability reading bounds"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testVisibleUnknownAvailabilityContrast() throws {
        let app = openCalendar()
        defer {
            app.tabBars.firstMatch.buttons["Today"].tap()
            XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
        }
        let text = app.staticTexts[
            "Test Sam isn’t sharing busy times for this day. Details are never shared."
        ]
        reveal(text, in: app)
        let frame = text.frame
        XCTAssertTrue(text.isHittable)
        XCTAssertGreaterThanOrEqual(frame.minY, 40)
        XCTAssertLessThanOrEqual(frame.maxY, app.tabBars.firstMatch.frame.minY)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Visible unknown availability contrast"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let data = try JSONSerialization.data(
            withJSONObject: [
                "paragraph": [frame.minX, frame.minY, frame.width, frame.height],
                "tabBarTop": app.tabBars.firstMatch.frame.minY,
            ], options: [.sortedKeys])
        let bounds = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        bounds.name = "Visible unknown availability bounds"
        bounds.lifetime = .keepAlways
        add(bounds)
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .contrast, test: self)
    }

    private func openCalendar() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "Requires an authorized test-member session")
        tabs.buttons["Calendar"].tap()
        XCTAssertTrue(app.navigationBars["Calendar"].waitForExistence(timeout: 30))
        return app
    }

    private func revealBoundary(_ element: XCUIElement, in app: XCUIApplication, start: Bool) {
        var observations: [[String: Any]] = []
        for _ in 0..<40 {
            let exists = element.exists
            let frame = exists ? element.frame : .zero
            let target = start ? CGFloat(55) : app.tabBars.firstMatch.frame.minY - 12
            let position = start ? frame.minY : frame.maxY
            observations.append([
                "exists": exists, "frame": [frame.minX, frame.minY, frame.width, frame.height], "start": start,
            ])
            let settled =
                start
                ? position >= 40 && (position <= 110 || frame.maxY <= app.tabBars.firstMatch.frame.minY)
                : position <= app.tabBars.firstMatch.frame.minY && (position >= target - 70 || frame.minY >= 40)
            if exists && element.isHittable && settled { return }
            let distance = exists ? max(-80, min(80, position - target)) : 80
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let destination = app.coordinate(
                withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: destination, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        add(XCTAttachment(screenshot: app.screenshot()))
        if let data = try? JSONSerialization.data(withJSONObject: observations, options: [.sortedKeys]) {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = "Unknown availability scroll observations"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        XCTFail("Could not reveal the required boundary of the unknown-availability explanation")
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        var observations: [[String: Any]] = []
        for _ in 0..<20 {
            let exists = element.exists
            let frame = exists ? element.frame : .zero
            observations.append(["exists": exists, "frame": [frame.minX, frame.minY, frame.width, frame.height]])
            if exists && element.isHittable && frame.minY >= 40
                && frame.maxY <= app.tabBars.firstMatch.frame.minY
            {
                return
            }
            let distance = exists ? max(-80, min(80, frame.minY - 55)) : 80
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let data = try? JSONSerialization.data(withJSONObject: observations, options: [.sortedKeys])
        if let data {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = "Permission scroll observations"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        add(XCTAttachment(screenshot: app.screenshot()))
        XCTFail("Could not reveal the full permission text above the native tab bar")
    }
}
