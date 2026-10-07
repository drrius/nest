import XCTest

@MainActor
final class VisibleRootContrastTests: XCTestCase {
    func testMealRowContrastAboveNativeTabBar() throws {
        try audit(tab: "Meals", kind: .button)
    }

    func testHistoryRowContrastAboveNativeTabBar() throws {
        try audit(tab: "Money", kind: .button)
    }

    private func audit(tab: String, kind: XCUIElement.ElementType) throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_VISIBLE_CONTRAST"] == "20261007-read-only" else {
            throw XCTSkip("Requires an explicitly identified fixture row; scrolling and unfiltered audit only")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        let identifier = try XCTUnwrap(env["NEST_QA_VISIBLE_ROW"])
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons[tab].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let row = app.descendants(matching: kind).matching(identifier: identifier).firstMatch
        try reader.reveal(row)
        try reader.requireTarget(row)
        reader.capture(row, name: "\(tab) affected row fully above native tab bar before unfiltered audit")
        continueAfterFailure = true
        try AccessibilityAuditDiagnostics.audit(app: app, types: .all, test: self)
    }
}
