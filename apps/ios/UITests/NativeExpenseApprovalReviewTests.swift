import XCTest

@MainActor
final class NativeExpenseApprovalReviewTests: XCTestCase {
    func testPartnerCannotSeeOwnersPendingExpense() throws {
        let app = try openApprovals(actor: "sam", budget: "0")
        XCTAssertTrue(app.staticTexts["No pending financial approvals."].waitForExistence(timeout: 25))
        XCTAssertFalse(
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Record expense")).firstMatch.exists)
        XCTAssertFalse(app.staticTexts["Nest QA category review 20261007"].exists)
        let capture = XCTAttachment(screenshot: app.screenshot())
        capture.name = "Partner sees no owner private expense proposal"
        capture.lifetime = .keepAlways
        add(capture)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    func testOwnerExplicitDeclineConfirmsNoExpenseAndFinishesJournal() throws {
        let app = try openApprovals(actor: "alex", budget: "1")
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let proposals = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Record expense"))
        XCTAssertTrue(proposals.firstMatch.waitForExistence(timeout: 20))
        XCTAssertEqual(proposals.count, 1)
        try reader.requireTarget(proposals.firstMatch)
        proposals.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Nest QA category review 20261007"].waitForExistence(timeout: 20))
        try reader.read("Home")
        let decline = app.buttons["Decline expense"]
        try reader.reveal(decline)
        try reader.requireTarget(decline)
        decline.tap()
        let confirmation = app.alerts["Decline expense?"].buttons["Decline"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 10))
        confirmation.tap()
        let outcome = "Expense declined. No expense was recorded by this approval."
        XCTAssertTrue(app.staticTexts[outcome].waitForExistence(timeout: 30))
        try reader.read(outcome)
        let done = app.buttons["Done"]
        try reader.reveal(done)
        try reader.requireTarget(done)
        reader.capture(done, name: "Explicit decline confirmed without expense")
        done.tap()
        XCTAssertTrue(app.staticTexts["No pending financial approvals."].waitForExistence(timeout: 20))
        XCTAssertFalse(app.buttons["Check expense decision"].exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
    }

    private func openApprovals(actor: String, budget: String) throws -> XCUIApplication {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_EXPENSE_DECISION"] == "20261007-\(actor)-\(budget)" else {
            throw XCTSkip("Requires exact private fixture actor and decision budget")
        }
        continueAfterFailure = false
        let name = actor == "alex" ? "Test Alex" : "Test Sam"
        let sim = actor == "alex" ? "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" : "CA0BCEDE-A297-493A-8921-9E31F8B65783"
        XCTAssertEqual(env["SIMULATOR_UDID"], sim)
        XCTAssertEqual(env["NEST_QA_NAME"], name)
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], budget)
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["tab-profile-action"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let more = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Older saved changes")).firstMatch
        try reader.reveal(more)
        try reader.requireTarget(more)
        more.tap()
        XCTAssertTrue(app.navigationBars["Older saved changes"].waitForExistence(timeout: 15))
        let approvals = app.buttons["Your financial approvals"]
        try reader.reveal(approvals)
        try reader.requireTarget(approvals)
        approvals.tap()
        return app
    }

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
        let more = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Older saved changes")).firstMatch
        try reader.reveal(more)
        try reader.requireTarget(more)
        more.tap()
        XCTAssertTrue(app.navigationBars["Older saved changes"].waitForExistence(timeout: 15))
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
