import XCTest

@MainActor
final class RenewalNavigationTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testUntouchedRenewalCancelRemainsReadable() throws {
        let fixture = try NativeMealWeekFixture(action: "renewal_navigation")
        let app = openRenewals(fixture: fixture)
        let add = app.navigationBars["Renewals"].buttons["Add"]
        capture([add], name: "Renewals add target", in: app)
        requireTarget(add)
        add.tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        let cancel = app.navigationBars["New renewal"].buttons["Cancel"]
        capture([cancel], name: "New renewal cancel target", in: app)
        requireTarget(cancel)
        let save = app.buttons["Save renewal"]
        reveal(save, in: app, permitsDisabled: true)
        XCTAssertFalse(save.isEnabled)
        cancel.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.sheets["Discard your unsaved changes?"].exists)
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testEditedRenewalCancelPreservesOrDiscardsOnlyLocalInput() throws {
        let fixture = try NativeMealWeekFixture(action: "renewal_navigation")
        let app = openRenewals(fixture: fixture)
        app.navigationBars["Renewals"].buttons["Add"].tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        let title = app.textFields["renewal-title"]
        reveal(title, in: app)
        XCTAssertEqual(title.label, "Renewal title")
        XCTAssertGreaterThanOrEqual(title.frame.width, 44 - 1e-9)
        for offset in [-21.0, 21.0] {
            title.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
                .withOffset(CGVector(dx: 0, dy: offset)).tap()
            XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
            app.buttons["Done"].tap()
        }
        title.tap()
        title.typeText("Nest unsent renewal QA")
        let done = app.buttons["Done"]
        capture([done], name: "Renewal keyboard done target", in: app)
        requireTarget(done)
        done.tap()
        let save = app.buttons["Save renewal"]
        reveal(save, in: app, permitsDisabled: true)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: save)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        let cancel = app.navigationBars["New renewal"].buttons["Cancel"]
        requireTarget(cancel)
        cancel.tap()
        let alert = app.alerts["Discard edits?"]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        capture(
            [alert.buttons["Keep editing"], alert.buttons["Discard changes"]], name: "Renewal draft choices", in: app)
        for choice in ["Keep editing", "Discard changes"] {
            requireTarget(alert.buttons[choice])
            XCTAssertGreaterThanOrEqual(alert.buttons[choice].frame.minY, alert.frame.minY)
            XCTAssertLessThanOrEqual(alert.buttons[choice].frame.maxY, alert.frame.maxY)
        }
        XCTAssertTrue(alert.staticTexts["Discard edits?"].exists)
        XCTAssertGreaterThanOrEqual(alert.frame.minY, app.frame.minY)
        XCTAssertLessThanOrEqual(alert.frame.maxY, app.frame.maxY)
        alert.buttons["Keep editing"].tap()
        reveal(title, in: app, earlier: true)
        XCTAssertEqual(title.value as? String, "Nest unsent renewal QA")
        cancel.tap()
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        alert.buttons["Discard changes"].tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        app.navigationBars["Renewals"].buttons["Add"].tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        XCTAssertTrue((title.value as? String) == "e.g. Home insurance" || (title.value as? String) == "")
        app.navigationBars["New renewal"].buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testRenewalModalViewportCensus() throws {
        let fixture = try NativeMealWeekFixture(action: "renewal_navigation")
        let app = openRenewals(fixture: fixture)
        app.navigationBars["Renewals"].buttons["Add"].tap()
        XCTAssertTrue(app.navigationBars["New renewal"].waitForExistence(timeout: 15))
        var samples: [[String: Any]] = []
        for step in 0..<6 {
            let elements =
                app.scrollViews.allElementsBoundByIndex + app.collectionViews.allElementsBoundByIndex
                + app.buttons.matching(identifier: "Save renewal").allElementsBoundByIndex
                + app.textFields.allElementsBoundByIndex + app.textViews.allElementsBoundByIndex
            let rows = elements.map { element in
                let frame = element.frame
                return [
                    "label": element.label, "type": element.elementType.rawValue,
                    "frame": [frame.minX, frame.minY, frame.width, frame.height],
                    "enabled": element.isEnabled, "hittable": element.isHittable,
                ] as [String: Any]
            }
            samples.append(["step": step, "elements": rows])
            app.swipeUp(velocity: .slow)
        }
        let data = try JSONSerialization.data(withJSONObject: samples, options: [.sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "Renewal modal viewport census"
        attachment.lifetime = .keepAlways
        add(attachment)
        capture([app.buttons["Save renewal"]], name: "Renewal final scroll viewport", in: app)
        app.navigationBars["New renewal"].buttons["Cancel"].tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        app.navigationBars["Renewals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func openRenewals(fixture: NativeMealWeekFixture) -> XCUIApplication {
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Today"].tap()
        let link = app.buttons["Manage renewals"]
        reveal(link, in: app)
        link.tap()
        XCTAssertTrue(app.navigationBars["Renewals"].waitForExistence(timeout: 15))
        let refresh = app.buttons["Refresh"]
        reveal(refresh, in: app, permitsDisabled: true)
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: refresh)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 30), .completed)
        return app
    }

    private func requireTarget(_ element: XCUIElement) {
        XCTAssertTrue(element.isHittable)
        XCTAssertTrue(element.isEnabled)
        XCTAssertGreaterThanOrEqual(element.frame.width, 44 - 1e-9)
        XCTAssertGreaterThanOrEqual(element.frame.height, 44 - 1e-9)
    }

    private func capture(_ elements: [XCUIElement], name: String, in app: XCUIApplication) {
        let rows = elements.map { element in
            let frame = element.frame
            return [
                "label": element.label, "enabled": element.isEnabled,
                "frame": [frame.minX, frame.minY, frame.width, frame.height],
            ] as [String: Any]
        }
        if let data = try? JSONSerialization.data(withJSONObject: rows, options: [.sortedKeys]) {
            let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
            attachment.name = name + " bounds"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    private func reveal(
        _ element: XCUIElement, in app: XCUIApplication, earlier: Bool = false, permitsDisabled: Bool = false
    ) {
        for _ in 0..<40 {
            let frame = element.exists ? element.frame : .zero
            let bottom = viewportBottom(in: app)
            if (element.isHittable || permitsDisabled && element.exists) && frame.minY >= 80 && frame.maxY <= bottom {
                return
            }
            if frame.isEmpty {
                if earlier { app.swipeDown(velocity: .slow) } else { app.swipeUp(velocity: .slow) }
                continue
            }
            let delta = frame.minY < 80 ? frame.minY - 100 : frame.maxY - bottom + 24
            let distance = max(-120, min(120, delta))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        XCTFail("Renewal navigation control is not fully visible")
    }

    private func viewportBottom(in app: XCUIApplication) -> CGFloat {
        guard app.navigationBars["New renewal"].exists else { return app.tabBars.firstMatch.frame.minY }
        let collections = app.collectionViews.allElementsBoundByIndex + app.scrollViews.allElementsBoundByIndex
        return collections.first(where: { $0.isHittable })?.frame.maxY ?? app.frame.maxY
    }
}
