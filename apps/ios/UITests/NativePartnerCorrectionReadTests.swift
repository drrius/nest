import XCTest

@MainActor
final class NativePartnerCorrectionReadTests: XCTestCase {
    func testPartnerReadsRetainedCorrectionAndRefundChainWithoutPosting() throws {
        let app = try ownedApp()
        let env = ProcessInfo.processInfo.environment
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let history = app.buttons["View full history"]
        try reader.reveal(history)
        try reader.requireTarget(history)
        history.tap()
        XCTAssertTrue(app.navigationBars["Financial history"].waitForExistence(timeout: 20))
        for kind in ["refund", "replacement", "reversal", "expense"] {
            let id = try XCTUnwrap(env["NEST_QA_PARTNER_" + kind.uppercased()])
            let row = app.buttons["money-event-" + id]
            try reader.reveal(row, searchEarlier: true)
            try reader.requireTarget(row)
            row.tap()
            XCTAssertTrue(app.navigationBars["Entry details"].waitForExistence(timeout: 15))
            try reader.read(kind.capitalized, searchEarlier: true)
            try reader.read("CHF 0.02", searchEarlier: true)
            if kind == "replacement" {
                try reader.read("Fictional corrected details; no actual transfer.")
            }
            reader.capture(reader.element(kind.capitalized), name: "Partner reads immutable " + kind)
            app.navigationBars["Entry details"].buttons.element(boundBy: 0).tap()
            XCTAssertTrue(app.navigationBars["Financial history"].waitForExistence(timeout: 15))
        }
        app.navigationBars["Financial history"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func ownedApp() throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_PARTNER_CORRECTION"] == "20261007-read-only" else {
            throw XCTSkip("Requires the owned partner clone and retained financial event identifiers")
        }
        continueAfterFailure = false
        let clone = try XCTUnwrap(env["NEST_QA_PARTNER_CLONE"])
        guard env["SIMULATOR_UDID"] == clone, UUID(uuidString: clone) != nil,
            !["C3ABC0D4-CFD4-4F23-8CC3-0E542014803A", "CA0BCEDE-A297-493A-8921-9E31F8B65783"].contains(clone)
        else { throw XCTSkip("Only the owned partner clone may perform this read-only journey") }
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Sam"].waitForExistence(timeout: 15))
        app.navigationBars.firstMatch.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        return app
    }
}
