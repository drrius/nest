import XCTest

@MainActor
final class RootAccessibilityTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testTodayAccessibility() throws {
        try audit(tab: "Today", ready: "Around the house")
    }

    func testMealsAccessibility() throws {
        try audit(tab: "Meals", ready: "Plan the week with AI")
    }

    func testCalendarAccessibility() throws {
        try audit(tab: "Calendar", ready: "Choose day")
    }

    func testCalendarDynamicTypeAndControls() throws {
        try audit(
            tab: "Calendar", ready: "Choose day",
            types: [.dynamicType, .hitRegion, .sufficientElementDescription, .textClipped, .trait])
    }

    func testMoneyAccessibility() throws {
        try audit(tab: "Money", ready: "Across your shared expenses")
    }

    private func audit(tab: String, ready: String, types: XCUIAccessibilityAuditType = .all) throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "Requires an existing authorized test-member session")
        let button = tabs.buttons[tab]
        XCTAssertTrue(button.isHittable)
        button.tap()
        let content = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", ready)).firstMatch
        XCTAssertTrue(content.waitForExistence(timeout: 30), "Required root content did not load")
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "\(tab) initial viewport"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: types, test: self)
    }
}

@MainActor
enum AccessibilityAuditDiagnostics {
    static func audit(app: XCUIApplication, types: XCUIAccessibilityAuditType, test: XCTestCase) throws {
        let tabs = app.tabBars.firstMatch
        try app.performAccessibilityAudit(for: types) { issue in
            let element = issue.element
            let frame = element?.frame ?? .zero
            let detail: [String: Any] = [
                "summary": issue.compactDescription,
                "detail": issue.detailedDescription,
                "label": element?.label ?? "",
                "type": String(describing: element?.elementType),
                "frame": [frame.minX, frame.minY, frame.width, frame.height],
                "tabBarFrame": [tabs.frame.minX, tabs.frame.minY, tabs.frame.width, tabs.frame.height],
            ]
            if let data = try? JSONSerialization.data(withJSONObject: detail, options: [.sortedKeys]) {
                let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
                attachment.name = "Accessibility issue"
                attachment.lifetime = .keepAlways
                test.add(attachment)
            }
            return false
        }
    }
}
