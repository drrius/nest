import XCTest

@MainActor
final class MoneyRootGroupingTests: XCTestCase {
    func testLargestTextSavedChangesDisclosureKeepsLinksReadable() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_MONEY_GROUPING_MAX"] == "20261007-alex-read-only" else {
            throw XCTSkip("Requires owned largest-text Money disclosure check")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Money"].tap()
        let reader = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let approvals = app.buttons["Your financial approvals"]
        try reader.reveal(approvals)
        try reader.requireTarget(approvals)
        XCTAssertEqual(approvals.frame.minX, 40, accuracy: 0.5)
        XCTAssertEqual(approvals.frame.maxX, app.frame.maxX - 40, accuracy: 0.5)
        reader.capture(approvals, name: "Largest text Money shared card insets")
        let disclosure = app.buttons["Saved changes"]
        try reader.reveal(disclosure)
        try reader.requireTarget(disclosure)
        disclosure.tap()
        for label in ["Draft dismissal", "Draft confirmation", "Rule adoption"] {
            let link = app.buttons[label]
            try reader.reveal(link)
            try reader.requireTarget(link)
            reader.capture(link, name: "Largest text saved change \(label)")
        }
        try reader.reveal(disclosure, searchEarlier: true)
        try reader.requireTarget(disclosure)
        disclosure.tap()
        XCTAssertFalse(app.buttons["Draft dismissal"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testBillsCardUsesSharedInsetsAndOpensApprovals() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_MONEY_GROUPING"] == "20261007-alex-read-only" else {
            throw XCTSkip("Requires owned fictional Money layout check")
        }
        continueAfterFailure = false
        XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], "0")
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
        XCTAssertEqual(approvals.frame.minX, 40, accuracy: 0.5)
        XCTAssertEqual(approvals.frame.maxX, app.frame.maxX - 40, accuracy: 0.5)
        reader.capture(approvals, name: "Money bills card shared page and inner insets")
        approvals.tap()
        XCTAssertTrue(app.navigationBars["Your approvals"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["No pending financial approvals."].waitForExistence(timeout: 20))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
