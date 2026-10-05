import XCTest

@MainActor
final class CalendarReadabilityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testUnrequestedCalendarPermissionRemainsReadable() throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "Requires an authorized test-member session")
        tabs.buttons["Calendar"].tap()
        XCTAssertTrue(app.staticTexts["Our household"].waitForExistence(timeout: 30))
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
