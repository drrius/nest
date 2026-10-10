import XCTest

@MainActor
final class NativeRenewalCrudTests: XCTestCase {
    private let original = "Nest native renewal 20261006"
    private let edited = "Nest native renewal edited 20261006"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testReadBaselineRenewalList() throws {
        let app = try open(action: "read_baseline")
        XCTAssertTrue(app.staticTexts["No renewals yet."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts[original].firstMatch.exists)
        XCTAssertFalse(app.staticTexts[edited].firstMatch.exists)
        capture(app, name: "Renewal baseline empty list")
        finish(app)
    }

    func testCreateOwnedRenewalOnce() throws {
        let app = try open(action: "create", role: "Test Alex")
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_PREFLIGHT"], "absent")
        XCTAssertTrue(app.staticTexts["No renewals yet."].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts[original].firstMatch.exists)
        app.navigationBars["Renewals"].buttons["Add"].tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        enter(original, replacing: nil, in: app)
        save(app, name: "Create owned renewal")
        retainReceipt(app, message: "Renewal saved.")
        XCTAssertTrue(app.staticTexts[original].firstMatch.waitForExistence(timeout: 15))
        capture(app, name: "Owned renewal created")
        finish(app)
    }

    func testEditOwnedRenewalOnce() throws {
        let app = try open(action: "edit", role: "Test Sam")
        try requireOwnedIdentity()
        XCTAssertTrue(app.staticTexts[original].firstMatch.waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts[edited].firstMatch.exists)
        XCTAssertEqual(app.buttons.matching(identifier: "Edit").count, 1)
        let edit = app.buttons["Edit"]
        reveal(edit, in: app)
        edit.tap()
        XCTAssertTrue(app.navigationBars["Edit renewal"].waitForExistence(timeout: 15))
        enter(edited, replacing: original, in: app)
        save(app, name: "Edit owned renewal")
        retainReceipt(app, message: "Renewal saved.")
        XCTAssertTrue(app.staticTexts[edited].firstMatch.waitForExistence(timeout: 15))
        capture(app, name: "Owned renewal edited by partner")
        finish(app)
    }

    func testRemoveOwnedRenewalOnce() throws {
        let app = try open(action: "remove", role: "Test Alex")
        try requireOwnedIdentity()
        XCTAssertTrue(app.staticTexts[edited].firstMatch.waitForExistence(timeout: 15))
        XCTAssertEqual(app.buttons.matching(identifier: "Remove").count, 1)
        let remove = app.buttons["Remove"]
        reveal(remove, in: app)
        remove.tap()
        let confirmation = app.buttons["Remove renewal"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Remove this renewal from Nest?"].exists)
        capture(app, name: "Owned renewal removal confirmation")
        confirmation.tap()
        retainReceipt(app, message: "Removed from Nest.")
        capture(app, name: "Owned renewal removal recorded")
        finish(app)
    }

    func testVerifyNativeSelectionWithoutSaving() throws {
        let app = try open(action: "verify_selection", role: "Test Sam")
        try requireOwnedIdentity()
        XCTAssertTrue(app.staticTexts[original].firstMatch.waitForExistence(timeout: 15))
        app.buttons["Edit"].tap()
        XCTAssertTrue(app.navigationBars["Edit renewal"].waitForExistence(timeout: 15))
        enter(edited, replacing: original, in: app)
        capture(app, name: "Native Select All replaces the owned title, unsent")
        discardEditedDraft(app)
        XCTAssertTrue(app.staticTexts[original].firstMatch.waitForExistence(timeout: 15))
        finish(app)
    }

    private func discardEditedDraft(_ app: XCUIApplication) {
        app.navigationBars["Edit renewal"].buttons["Cancel"].tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        capture(app, name: "Explicitly discard unsent owned edit")
        alert.buttons["Discard changes"].tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
    }

    func testClearOnlyRecordedOwnedRequest() throws {
        let app = try open(action: "clear_recorded")
        try requireOwnedIdentity()
        let title = ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_RECORDED_TITLE"]
        XCTAssertTrue([original, edited].contains(title))
        XCTAssertTrue(app.staticTexts[try XCTUnwrap(title)].firstMatch.waitForExistence(timeout: 15))
        let removing = ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_RECORDED_REMOVAL"] == "true"
        clearReceipt(app, message: removing ? "Removed from Nest." : "Renewal saved.")
        capture(app, name: "Recorded owned request cleared through Done")
        finish(app)
    }

    private func open(action: String, role: String? = nil) throws -> XCUIApplication {
        let name = try authorized(action: action, role: role)
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        addTeardownBlock { [app] in
            let screenshot = XCTAttachment(screenshot: app.screenshot())
            screenshot.name = "Renewal terminal native screen"
            screenshot.lifetime = .keepAlways
            self.add(screenshot)
        }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()  // Renewals live under Money → Bills & renewals.
        let link = app.buttons["Manage renewals"]
        reveal(link, in: app)
        link.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        let refresh = app.buttons["Refresh"]
        reveal(refresh, in: app)
        waitEnabled(refresh)
        return app
    }

    private func authorized(action: String, role: String?) throws -> String {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_RENEWAL_CRUD"] == "20261006",
                environment["NEST_QA_RENEWAL_ACTION"] == action
            else { throw XCTSkip("Requires the exact authorized fictional renewal action.") }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            let name = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            XCTAssertEqual(environment["NEST_QA_RENEWAL_NAME"], name)
            if let role { XCTAssertEqual(name, role) }
            return name
        #else
            throw XCTSkip("Fictional renewal commands are forbidden on physical phones.")
        #endif
    }

    private func requireOwnedIdentity() throws {
        let value = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_ID"])
        _ = try XCTUnwrap(UUID(uuidString: value))
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_PREFLIGHT"], "owned_exact_record")
    }

    private func enter(_ value: String, replacing baseline: String?, in app: XCUIApplication) {
        let title = app.textFields["renewal-title"]
        reveal(title, in: app)
        XCTAssertEqual(title.label, "Renewal title")
        title.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        if let baseline {
            XCTAssertEqual(title.value as? String, baseline)
            title.press(forDuration: 1.2)
            let selectAll = app.descendants(matching: .any).matching(identifier: "Select All").firstMatch
            XCTAssertTrue(selectAll.waitForExistence(timeout: 15))
            capture(app, name: "Native renewal title selection menu")
            selectAll.tap()
        }
        title.typeText(value)
        XCTAssertEqual(title.value as? String, value)
        app.buttons["Done"].tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists)
    }

    private func save(_ app: XCUIApplication, name: String) {
        let save = app.buttons["Save renewal"]
        reveal(save, in: app)
        waitEnabled(save)
        capture(app, name: name + " before Save")
        save.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 30))
    }

    private func retainReceipt(_ app: XCUIApplication, message: String) {
        let recorded = app.staticTexts[message]
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        reveal(recorded, in: app)
        capture(app, name: message + " recorded receipt")
        XCTAssertTrue(app.buttons["Done"].exists)
    }

    private func clearReceipt(_ app: XCUIApplication, message: String) {
        let recorded = app.staticTexts[message]
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        reveal(recorded, in: app)
        capture(app, name: message + " recorded receipt")
        let done = app.buttons["Done"]
        reveal(done, in: app)
        waitEnabled(done)
        done.tap()
        let cleared = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: recorded)
        XCTAssertEqual(XCTWaiter.wait(for: [cleared], timeout: 30), .completed)
    }

    private func waitEnabled(_ element: XCUIElement) {
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: element)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<40 {
            let frame = element.exists ? element.frame : .zero
            let bottom = viewportBottom(app)
            if element.isHittable && frame.minY >= 80 && frame.maxY <= bottom { return }
            if frame.isEmpty {
                app.swipeUp(velocity: .slow)
                continue
            }
            let delta = frame.minY < 80 ? frame.minY - 100 : frame.maxY - bottom + 24
            let distance = max(-120, min(120, delta))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Required renewal control is not fully visible")
    }

    private func viewportBottom(_ app: XCUIApplication) -> CGFloat {
        let editing = app.navigationBars["New renewal"].exists || app.navigationBars["Edit renewal"].exists
        guard editing else { return app.tabBars.firstMatch.frame.minY }
        let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
        return lists.first(where: { $0.isHittable })?.frame.maxY ?? app.frame.maxY
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

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }
}
