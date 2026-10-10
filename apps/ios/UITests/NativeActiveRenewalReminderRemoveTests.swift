import XCTest

@MainActor
final class NativeActiveRenewalReminderRemoveTests: XCTestCase {
    private let title = "Nest QA reminder 0610-3f88"
    private let id = "23435fe5-5b08-48cd-b0fb-03f0e2d49690"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testCancelThenOneOrdinaryOwnedRemoval() throws {
        try authorized(action: "remove_once")
        let app = open()
        XCTAssertFalse(app.staticTexts["Your saved renewal request"].exists)
        let titleText = app.staticTexts[title].firstMatch
        reveal(titleText, in: app)
        XCTAssertEqual(app.buttons.matching(identifier: "Remove").count, 1)
        for label in ["Edit", "Reminder choices"] {
            let target = app.buttons[label]
            reveal(target, in: app)
            requireTarget(target, in: app)
        }
        let remove = app.buttons["Remove"]
        reveal(remove, in: app)
        requireTarget(remove, in: app)
        remove.tap()
        confirmation(app, choice: "Cancel")
        XCTAssertFalse(app.buttons["Remove renewal"].exists)
        XCTAssertTrue(titleText.exists)
        capture(app, name: "Cancel leaves exact active renewal unchanged before any command")
        reveal(remove, in: app)
        requireTarget(remove, in: app)
        remove.tap()
        confirmation(app, choice: "Remove renewal")
        recordedCopy(app)
        capture(app, name: "One owned removal recorded before scoped journal capture")
    }

    func testColdRestartOriginalRemovalReceiptAndDone() throws {
        try authorized(action: "recorded_done")
        try requireRecordedIdentity()
        let app = open()
        recordedCopy(app)
        let done = app.buttons["Done"]
        reveal(done, in: app)
        requireTarget(done, in: app)
        capture(app, name: "Cold restart retained exact removal request before ordinary Done")
        done.tap()
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: done)
        XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 30), .completed)
        XCTAssertFalse(app.staticTexts["Your saved renewal request"].exists)
        let empty = app.staticTexts["No renewals yet."]
        reveal(empty, in: app)
        XCTAssertTrue(empty.exists)
        XCTAssertFalse(app.staticTexts[title].exists)
        capture(app, name: "Ordinary Done clears original request and active renewal list is empty")
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Returned to original Today after one removal")
    }

    private func open() -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        addTeardownBlock { [app] in self.capture(app, name: "Removal terminal native screen") }
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Today"].tap()
        app.buttons["Profile and preferences"].tap()
        XCTAssertTrue(app.staticTexts["Test Alex"].waitForExistence(timeout: 15))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        let link = app.buttons["Manage renewals"]
        reveal(link, in: app)
        XCTAssertTrue(link.isEnabled && link.isHittable)
        link.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        return app
    }

    private func confirmation(_ app: XCUIApplication, choice: String) {
        let remove = app.buttons["Remove renewal"]
        XCTAssertTrue(remove.waitForExistence(timeout: 15))
        let heading = app.staticTexts["Remove this renewal from Nest?"]
        XCTAssertTrue(heading.exists && app.frame.contains(heading.frame))
        let disclaimer =
            "This does not cancel the contract, change a linked recurring expense or erase financial history."
        let texts = app.staticTexts.allElementsBoundByIndex.filter {
            $0.label.contains(title) && $0.label.contains(disclaimer)
        }
        XCTAssertEqual(texts.count, 1)
        if let text = texts.first {
            XCTAssertTrue(app.frame.contains(text.frame))
            XCTAssertEqual(
                text.label.split(whereSeparator: { $0.isWhitespace }).joined(separator: " "), title + " " + disclaimer)
        }
        for label in ["Cancel", "Remove renewal"] { requireTarget(app.buttons[label], in: app) }
        capture(app, name: "Exact owned removal disclosure and full native " + choice + " target")
        app.buttons[choice].tap()
    }

    private func recordedCopy(_ app: XCUIApplication) {
        let header = app.staticTexts["Your saved renewal request"]
        reveal(header, in: app, missingDistance: -180)
        XCTAssertTrue(header.waitForExistence(timeout: 30))
        for label in ["Remove from Nest", title, "Unassigned", "No linked recurring expense", "Removed from Nest."] {
            let text = app.staticTexts[label].firstMatch
            reveal(text, in: app)
            XCTAssertEqual(text.label, label)
        }
        XCTAssertTrue(app.buttons["Done"].exists)
    }

    private func requireTarget(_ target: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(target.exists && target.isEnabled && target.isHittable)
        XCTAssertTrue(app.frame.contains(target.frame))
        XCTAssertGreaterThanOrEqual(target.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(target.frame.height, 44 - 0.001)
    }

    private func reveal(_ target: XCUIElement, in app: XCUIApplication, missingDistance: CGFloat = 250) {
        var frames: [[String: Any]] = []
        for _ in 0..<24 {
            let nav = app.navigationBars.allElementsBoundByIndex.first { $0.isHittable }
            let top = nav?.frame.maxY ?? 80
            let bottom = app.tabBars.firstMatch.frame.minY - 8
            let frame = target.exists ? target.frame : .zero
            frames.append([
                "frame": [frame.minX, frame.minY, frame.width, frame.height], "exists": target.exists, "top": top,
                "bottom": bottom,
            ])
            if target.exists && target.isHittable && frame.minY >= top && frame.maxY <= bottom { return }
            let delta =
                frame.isEmpty ? missingDistance : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let sign: CGFloat = delta < 0 ? -1 : 1
            let distance = sign * min(delta < 0 ? 180 : 250, max(120, abs(delta)))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        let data = try? JSONSerialization.data(withJSONObject: frames, options: [.sortedKeys])
        if let data {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        capture(app, name: "Owned removal control placement failure")
        XCTFail("Whole owned removal target must fit its native viewport")
    }

    private func requireRecordedIdentity() throws {
        let env = ProcessInfo.processInfo.environment
        let operation = try XCTUnwrap(UUID(uuidString: try XCTUnwrap(env["NEST_QA_RENEWAL_REMOVE_OPERATION_ID"])))
        let raw = try XCTUnwrap(env["NEST_QA_RENEWAL_REMOVE_REQUEST_JSON"])
        let saved = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let command = try XCTUnwrap(saved["command"] as? [String: Any])
        let result = try XCTUnwrap(saved["result"] as? [String: Any])
        XCTAssertEqual(UUID(uuidString: try XCTUnwrap(command["operationId"] as? String)), operation)
        XCTAssertEqual((command["renewalId"] as? String)?.lowercased(), id)
        XCTAssertNil(command["fields"])
        XCTAssertEqual(result["status"] as? String, "recorded")
        XCTAssertEqual(saved["cancellationRequested"] as? Bool, false)
    }

    private func authorized(action: String) throws {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RENEWAL_REMINDER_REMOVE_UI"] == "20261006" else {
                throw XCTSkip("Requires dated exact owned renewal removal scope.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMOVE_NAME"], "Test Alex")
            XCTAssertEqual(env["NEST_QA_RENEWAL_ID"], id)
            XCTAssertEqual(env["NEST_QA_RENEWAL_REVISION"], "6610131c-d4d9-42fc-89f2-42ffe0a7b777")
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMOVE_ACTION"], action)
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMOVE_POST_BUDGET"], action == "remove_once" ? "1" : "0")
            XCTAssertEqual(env["NEST_QA_REMINDER_OPERATION_ID"], "32102900-3d5a-4aa6-9d41-647dab7cf63c")
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
        #else
            throw XCTSkip("Owned renewal removal is forbidden on physical phones.")
        #endif
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let image = XCTAttachment(screenshot: app.screenshot())
        image.name = name
        image.lifetime = .keepAlways
        add(image)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
}
