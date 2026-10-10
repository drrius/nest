import XCTest

@MainActor
final class NativeActiveRecurringReminderFixtureTests: XCTestCase {
    private let title = "Nest QA reminder bill 0610-5d1a"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCreateOneFutureVariableRuleThroughNativeReview() throws {
        try authorized(action: "create_once")
        let app = openNew()
        try enter(title, label: "Description", replacing: false, in: app)
        try enter("2026-11-01", label: "Start date (YYYY-MM-DD)", replacing: true, in: app)
        for label in ["Recording, Confirm each bill", "Payer, Test Alex", "Frequency, Monthly", "Day of month, 1"] {
            let row = app.descendants(matching: .any).matching(identifier: label).firstMatch
            reveal(row, in: app)
            XCTAssertEqual(row.label, label)
        }
        XCTAssertFalse(app.staticTexts["Automatic amount and split"].exists)
        let note = try field("Note (optional)", in: app)
        reveal(note, in: app)
        XCTAssertTrue(["", "Note (optional)"].contains(note.value as? String ?? "missing"))
        XCTAssertTrue(app.buttons["Choose category (optional)"].exists)
        let review = app.buttons["Review rule"]
        reveal(review, in: app)
        requireAction(review, in: app)
        capture(app, name: "Future variable draft before local Review rule")
        review.tap()
        reviewedCopy(app, payer: "Test Alex")
        let save = app.buttons["Save bill reminders"]
        reveal(save, in: app)
        requireAction(save, in: app)
        XCTAssertFalse(app.buttons["Save automatic rule"].exists)
        capture(app, name: "Exact variable consent before the only Save bill reminders")
        save.tap()
        let recorded = app.staticTexts["Rule saved · active."]
        reveal(recorded, in: app)
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        capture(app, name: "Original variable rule receipt before scoped journal capture")
    }

    func testKnownRecordedVariableRuleOrdinaryDone() throws {
        try authorized(action: "recorded_done")
        try knownRequest()
        let app = openNew()
        reviewedCopy(app, payer: "You")
        let recorded = app.staticTexts["Rule saved · active."]
        reveal(recorded, in: app)
        XCTAssertTrue(recorded.exists)
        let done = app.buttons["Done"]
        reveal(done, in: app)
        requireAction(done, in: app)
        capture(app, name: "Original recorded variable rule before ordinary Done")
        done.tap()
        let cleared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: recorded)
        XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 30), .completed)
        XCTAssertFalse(app.buttons["Save bill reminders"].exists)
        XCTAssertFalse(app.buttons["Save automatic rule"].exists)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Original Today after clearing only the known variable request")
    }

    private func openNew() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        addTeardownBlock { [app] in self.capture(app, name: "Variable fixture terminal native screen") }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()
        let recurring = app.buttons["Recurring expenses"]
        reveal(recurring, in: app)
        XCTAssertTrue(recurring.isEnabled && recurring.isHittable)
        recurring.tap()
        XCTAssertTrue(app.navigationBars["Recurring expenses"].waitForExistence(timeout: 15))
        let create = app.buttons["New recurring expense"]
        reveal(create, in: app)
        XCTAssertTrue(create.isEnabled && create.isHittable)
        create.tap()
        XCTAssertTrue(app.navigationBars["New recurring expense"].waitForExistence(timeout: 15))
        return app
    }

    private func reviewedCopy(_ app: XCUIApplication, payer: String) {
        let labels = [
            title, "Confirm amount and split each cycle", "Payer, " + payer, "Monthly, day 1", "Starts, 2026-11-01",
            "First due, 2026-11-01", "Existing history stays unchanged. Saving does not move money.",
        ]
        for label in labels {
            let text = app.descendants(matching: .any).matching(identifier: label).firstMatch
            reveal(text, in: app)
            XCTAssertEqual(text.label, label)
            capture(app, name: "Native variable review: " + label)
        }
        XCTAssertFalse(app.staticTexts["Automatically recorded each cycle"].exists)
    }

    private func field(_ label: String, in app: XCUIApplication) throws -> XCUIElement {
        XCTAssertTrue(
            app.descendants(matching: .any).matching(identifier: label).firstMatch.waitForExistence(timeout: 30))
        let fields =
            app.textFields.matching(identifier: label).allElementsBoundByIndex
            + app.textViews.matching(identifier: label).allElementsBoundByIndex
        XCTAssertEqual(fields.count, 1, "One actual native editable control is required")
        return try XCTUnwrap(fields.first)
    }

    private func enter(_ value: String, label: String, replacing: Bool, in app: XCUIApplication) throws {
        let input = try field(label, in: app)
        reveal(input, in: app)
        XCTAssertTrue(input.isEnabled && input.isHittable)
        input.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        if replacing {
            input.press(forDuration: 1.2)
            let select = app.descendants(matching: .any).matching(identifier: "Select All").firstMatch
            XCTAssertTrue(select.waitForExistence(timeout: 15))
            select.tap()
        }
        input.typeText(value)
        XCTAssertEqual(input.value as? String, value)
        let done = app.buttons["Done"]
        requireAction(done, in: app)
        done.tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists)
    }

    private func requireAction(_ target: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(target.exists && target.isEnabled && target.isHittable)
        XCTAssertTrue(app.frame.contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 0.001)
    }

    private func reveal(_ target: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<24 {
            let nav = app.navigationBars.allElementsBoundByIndex.first { $0.isHittable }
            let top = nav?.frame.maxY ?? 80
            let bottom =
                app.keyboards.firstMatch.exists
                ? app.keyboards.firstMatch.frame.minY - 8 : app.tabBars.firstMatch.frame.minY - 8
            let frame = target.exists ? target.frame : .zero
            if target.exists && target.isHittable && frame.minY >= top && frame.maxY <= bottom { return }
            let delta = frame.isEmpty ? 180 : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let sign: CGFloat = delta < 0 ? -1 : 1
            let distance = sign * min(180, max(80, abs(delta)))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        capture(app, name: "Variable fixture control placement failure")
        XCTFail("Whole native variable control must be visible before interaction")
    }

    private func knownRequest() throws {
        let env = ProcessInfo.processInfo.environment
        let raw = try XCTUnwrap(env["NEST_QA_RECURRING_FIXTURE_REQUEST_JSON"])
        let saved = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let command = try XCTUnwrap(saved["command"] as? [String: Any])
        let rule = try XCTUnwrap(command["rule"] as? [String: Any])
        let result = try XCTUnwrap(saved["result"] as? [String: Any])
        XCTAssertEqual(
            UUID(uuidString: try XCTUnwrap(command["operationId"] as? String)),
            UUID(uuidString: try XCTUnwrap(env["NEST_QA_RECURRING_FIXTURE_OPERATION_ID"])))
        XCTAssertEqual(
            UUID(uuidString: try XCTUnwrap(rule["ruleId"] as? String)),
            UUID(uuidString: try XCTUnwrap(env["NEST_QA_RECURRING_FIXTURE_RULE_ID"])))
        XCTAssertEqual(result["status"] as? String, "recorded")
        XCTAssertEqual(saved["cancellationRequested"] as? Bool, false)
    }

    private func authorized(action: String) throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RECURRING_FIXTURE_UI"] == "20261006" else {
                throw XCTSkip("Requires dated single variable rule creation or known Done.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_TITLE"], title)
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_ACTION"], action)
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_POST_BUDGET"], action == "create_once" ? "1" : "0")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional variable rule creation is forbidden on physical phones.")
        #endif
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
