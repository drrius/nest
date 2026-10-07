import XCTest

@MainActor
final class NativeExpenseApprovalReviewTests: XCTestCase {
    func testOwnedPendingExpenseShowsCategoryAndCancelKeepsDecisionPending() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_REVIEW"] == "20261007-alex-no-decision" else {
            throw XCTSkip("Requires the exact fictional pending expense review fixture")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        XCTAssertEqual(env["NEST_QA_NAME"], "Test Alex")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let approvals = app.buttons["Your financial approvals"]
        try reader.reveal(approvals)
        try reader.requireTarget(approvals)
        approvals.tap()
        let proposal = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Record expense")).firstMatch
        XCTAssertTrue(proposal.waitForExistence(timeout: 20))
        try reader.reveal(proposal)
        try reader.requireTarget(proposal)
        proposal.tap()
        XCTAssertTrue(app.navigationBars["Review expense"].waitForExistence(timeout: 15))
        let description = app.staticTexts["Nest QA category review 20261007"]
        XCTAssertTrue(description.waitForExistence(timeout: 20))
        try reader.read("Nest QA category review 20261007")
        try reader.read("Home")
        let approve = app.buttons["Approve expense"]
        try reader.reveal(approve)
        try reader.requireTarget(approve)
        XCTAssertTrue(approve.isEnabled)
        reader.capture(approve, name: "Exact pending expense category reviewed before decision")
        let decline = app.buttons["Decline expense"]
        try reader.reveal(decline)
        try reader.requireTarget(decline)
        decline.tap()
        XCTAssertTrue(app.alerts["Decline expense?"].waitForExistence(timeout: 10))
        app.alerts["Decline expense?"].buttons["Cancel"].tap()
        XCTAssertFalse(app.alerts["Decline expense?"].exists)
        XCTAssertTrue(app.buttons["Approve expense"].isEnabled)
        app.navigationBars["Review expense"].buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
