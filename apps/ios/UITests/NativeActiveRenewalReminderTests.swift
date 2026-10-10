import XCTest

@MainActor
final class NativeActiveRenewalReminderTests: XCTestCase {
    private let title = "Nest QA reminder 0610-3f88"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testColdLaunchOriginalIdentityAndTodayWithoutCommands() throws {
        try authorized("read_original_identity_scope")
        let name = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_RENEWAL_NAME"])
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.terminate()
        app.launch()
        addTeardownBlock { [app] in self.capture(app, name: "Original identity cold-launch terminal screen") }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        for name in ["Today", "Meals", "Calendar", "Money"] {
            XCTAssertTrue(app.tabBars.firstMatch.buttons[name].exists)
        }
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 15))
        capture(app, name: "Shipping cold launch verified original " + name + " profile")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        let offline = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", "saved chores")).firstMatch
        XCTAssertFalse(offline.exists)
        capture(app, name: "Shipping cold launch restored original Today and shared filter")
    }

    func testCreateFreshFutureRenewalExactlyOnceAndRetainReceipt() throws {
        try authorized("create_once")
        XCTAssertEqual(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_RENEWAL_PREFLIGHT"], "exact_absent_baseline")
        let app = openRenewals()
        XCTAssertTrue(app.staticTexts["No renewals yet."].waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts[title].exists)
        let add = app.navigationBars["Renewals"].buttons["Add"]
        requireAction(add, in: app)
        add.tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        let field = app.textFields["renewal-title"]
        reveal(field, in: app)
        XCTAssertEqual(field.label, "Renewal title")
        field.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        field.typeText(title)
        XCTAssertEqual(field.value as? String, title)
        let keyboardDone = app.buttons["Done"]
        requireAction(keyboardDone, in: app)
        keyboardDone.tap()
        XCTAssertFalse(app.keyboards.firstMatch.exists)
        selectTomorrow(app)
        assertFreshFields(app)
        let save = app.buttons["Save renewal"]
        reveal(save, in: app)
        XCTAssertTrue(save.isEnabled && save.isHittable)
        capture(app, name: "One future unassigned unlinked renewal before deliberate Create")
        save.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 30))
        let recorded = app.staticTexts["Renewal saved."]
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        reveal(recorded, in: app, permitsDisabled: true)
        XCTAssertTrue(app.staticTexts[title].firstMatch.exists)
        XCTAssertTrue(app.buttons["Done"].exists)
        capture(app, name: "Exact created renewal recorded request retained before Done")
    }

    func testFinishExactCreatedRenewalThroughNormalDone() throws {
        try authorized("finish_created")
        let env = ProcessInfo.processInfo.environment
        XCTAssertNotNil(UUID(uuidString: try XCTUnwrap(env["NEST_QA_ACTIVE_RENEWAL_ID"])))
        XCTAssertNotNil(UUID(uuidString: try XCTUnwrap(env["NEST_QA_ACTIVE_RENEWAL_OPERATION"])))
        XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_PREFLIGHT"], "exact_recorded_request")
        let app = openRenewals(recordedRequest: true)
        let recorded = app.staticTexts["Renewal saved."]
        XCTAssertTrue(recorded.waitForExistence(timeout: 30))
        reveal(recorded, in: app, permitsDisabled: true)
        XCTAssertTrue(app.staticTexts[title].firstMatch.exists)
        capture(app, name: "Owned immutable creation request before normal Done")
        let done = app.buttons["Done"]
        reveal(done, in: app)
        XCTAssertTrue(done.isEnabled && done.isHittable)
        done.tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: recorded)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 30), .completed)
        XCTAssertTrue(app.staticTexts[title].firstMatch.exists)
        XCTAssertFalse(app.buttons["Done"].exists)
        capture(app, name: "Done cleared only the creation intent and retained the active renewal")
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Restored Today and original filter after creation Done")
    }

    private func openRenewals(recordedRequest: Bool = false) -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        addTeardownBlock { [app] in
            let attachment = XCTAttachment(screenshot: app.screenshot())
            attachment.name = "Active renewal phase-one terminal screen"
            attachment.lifetime = .keepAlways
            self.add(attachment)
        }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Money"].tap()  // Renewals live under Money → Bills & renewals.
        let renewals = app.buttons["Manage renewals"]
        reveal(renewals, in: app)
        XCTAssertTrue(renewals.isEnabled && renewals.isHittable)
        renewals.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        if recordedRequest {
            XCTAssertTrue(app.staticTexts["Renewal saved."].waitForExistence(timeout: 30))
            XCTAssertTrue(app.staticTexts[title].firstMatch.exists)
        } else {
            let ready = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "enabled == true"), object: app.buttons["Refresh"])
            XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        }
        return app
    }

    private func selectTomorrow(_ app: XCUIApplication) {
        let picker = app.datePickers.firstMatch
        reveal(picker, in: app)
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, "Oct 6, 2026")
        XCTAssertTrue(picker.isEnabled && picker.isHittable)
        picker.tap()
        capture(app, name: "Native renewal calendar before exact future date")
        let day = app.buttons["Wednesday, October 7"]
        XCTAssertTrue(day.waitForExistence(timeout: 15))
        XCTAssertTrue(day.isEnabled && day.isHittable)
        day.tap()
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.8)).tap()
        XCTAssertEqual(picker.buttons["Date Picker"].value as? String, "Oct 7, 2026")
        capture(app, name: "Native renewal date selected as 2026-10-07 without Save")
    }

    private func assertFreshFields(_ app: XCUIApplication) {
        let notice = app.steppers["Notice: 0 days"]
        reveal(notice, in: app, permitsDisabled: true)
        XCTAssertTrue(notice.exists)
        let cancellation = app.staticTexts["Cancel by 2026-10-07"]
        reveal(cancellation, in: app, permitsDisabled: true)
        for (label, value) in [("Responsible", "Unassigned"), ("Linked recurring expense", "None")] {
            let choice = app.buttons[label + ", " + value]
            reveal(choice, in: app)
            XCTAssertEqual(choice.label, label + ", " + value)
        }
        XCTAssertFalse(app.staticTexts["Could not load household choices. Connect and try again."].exists)
    }

    private func requireAction(_ element: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(element.exists && element.isEnabled && element.isHittable)
        XCTAssertTrue(app.frame.contains(element.frame))
        XCTAssertGreaterThanOrEqual(element.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(element.frame.height, 44 - 0.001)
    }

    private func authorized(_ action: String) throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_ACTIVE_RENEWAL_UI"] == "20261006",
                env["NEST_QA_ACTIVE_RENEWAL_ACTION"] == action
            else { throw XCTSkip("Requires the exact authorized phase-one renewal action.") }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
            ]
            let name = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_NAME"], name)
            if action != "read_original_identity_scope" { XCTAssertEqual(name, "Test Alex") }
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_TITLE"], title)
            let budget = action == "read_original_identity_scope" ? "read_only_scope_recovery" : "one_create_only"
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_PHASE_ONE_BUDGET"], budget)
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Fictional renewal commands are forbidden on physical phones.")
        #endif
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, permitsDisabled: Bool = false, missingDistance: CGFloat = 250
    ) {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let lists = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
            let bounds = lists.first(where: { $0.isHittable })?.frame ?? app.frame
            let nav = app.navigationBars.allElementsBoundByIndex.first(where: { $0.isHittable })
            let top = nav?.frame.maxY ?? 80
            let bottom = app.tabBars.firstMatch.isHittable ? app.tabBars.firstMatch.frame.minY - 8 : bounds.maxY - 8
            let start = CGPoint(x: app.frame.width * 0.04, y: app.frame.height * 0.65)
            XCTAssertTrue(bounds.contains(start))
            let exists = element.exists
            let frame = exists ? element.frame : .zero
            frames.append([
                "frame": rect(frame), "exists": exists, "top": top, "bottom": bottom,
                "gestureStart": [start.x, start.y], "missingDirection": missingDistance,
            ])
            let usable = exists && (permitsDisabled || element.isHittable)
            if usable && frame.minY >= top && frame.maxY <= bottom {
                attach(frames, name: "Measured actual active renewal control viewport")
                return
            }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let origin = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            origin.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        attach(frames, name: "Failed active renewal control viewport")
        capture(app, name: "Active renewal control placement failure")
        XCTFail("Required control must be fully visible")
    }

    private func rect(_ frame: CGRect) -> [CGFloat] { [frame.minX, frame.minY, frame.width, frame.height] }
    private func attach(_ value: Any, name: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
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
}
