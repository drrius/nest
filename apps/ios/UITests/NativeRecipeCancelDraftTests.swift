import XCTest

@MainActor
final class NativeRecipeCancelDraftTests: XCTestCase {
    private struct Recipe: Decodable {
        let title: String
        let servings: Int?
        let instructions: String?
    }

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testBeforeFixUntouchedNewRecipeCancelClosesDirectly() throws {
        _ = try authorized(phase: "before")
        let app = try openLibrary()
        openCreate(app, diagnostic: true)
        let cancel = app.navigationBars["New recipe"].buttons["Cancel"]
        requireAction(cancel, in: app)
        capture(app, name: "Before untouched New recipe Cancel")
        cancel.tap()
        let closed = disappearance(app.navigationBars["New recipe"], timeout: 5)
        capture(app, name: "Actual untouched Cancel result before fix")
        if app.alerts["Discard draft?"].exists {
            choose(
                "Discard draft", alert: "Discard draft?", in: app,
                name: "Ordinary cleanup after incorrect pristine alert")
        }
        finish(app)
        XCTAssertEqual(closed, .completed, "An untouched new recipe must close without a discard confirmation")
    }

    func testAfterFixPristineAndInvalidRawRecipeDraftCancellation() throws {
        let recipe = try authorized(phase: "after")
        let app = try openLibrary()
        openCreate(app)
        cancelPristine("New recipe", in: app)
        openCreate(app)
        swipeSheet("New recipe", dirty: false, in: app)
        openCreate(app)
        dirtyAndDiscard("New recipe", baseline: "2", in: app)
        openCreate(app)
        XCTAssertEqual(app.textFields["Servings"].value as? String, "2")
        XCTAssertEqual(app.textFields["Name"].value as? String, "Name")
        cancelPristine("New recipe", in: app)
        openRecipe(app, title: recipe.title)
        openEdit(app, recipe: recipe)
        cancelPristine("Edit recipe", in: app)
        openEdit(app, recipe: recipe)
        swipeSheet("Edit recipe", dirty: false, in: app)
        openEdit(app, recipe: recipe)
        dirtyAndDiscard("Edit recipe", baseline: recipe.servings.map(String.init) ?? "", in: app)
        openEdit(app, recipe: recipe)
        verifyRecipe(recipe, in: app)
        capture(app, name: "Reopened exact current canonical recipe after local Discard")
        cancelPristine("Edit recipe", in: app)
        app.navigationBars["Recipe"].buttons.element(boundBy: 0).tap()
        finish(app)
    }

    private func openLibrary() throws -> XCUIApplication {
        let fixture = try NativeMealWeekFixture(action: "read_recipe_cancel_drafts")
        return fixture.openLibrary()
    }

    private func openCreate(_ app: XCUIApplication, diagnostic: Bool = false) {
        let bar = app.navigationBars["Saved meals"]
        let button = bar.buttons["New recipe"]
        XCTAssertTrue(button.exists && button.isEnabled && button.isHittable)
        XCTAssertTrue(bar.frame.contains(button.frame) && app.frame.contains(button.frame))
        attach(
            [
                "navigationBar": rect(bar.frame), "button": rect(button.frame), "diagnosticBeforeOnly": diagnostic,
                "minimumTargetContractMet": button.frame.width >= 44 && button.frame.height >= 44,
            ], name: "Actual New recipe toolbar entry target")
        if diagnostic {
            capture(app, name: "Before diagnostic undersized New recipe entry is not a44pt acceptance pass")
            button.tap()
        } else {
            requireAction(button, in: app)
            button.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: 2, dy: 0)).tap()
        }
        XCTAssertTrue(app.navigationBars["New recipe"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.textFields["Name"].waitForExistence(timeout: 15))
        XCTAssertFalse(app.navigationBars["New recipe"].buttons["Save"].isEnabled)
    }

    private func openRecipe(_ app: XCUIApplication, title: String) {
        let matches = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title))
        XCTAssertEqual(matches.count, 1)
        let row = matches.firstMatch
        reveal(row, in: app)
        row.tap()
        XCTAssertTrue(app.navigationBars["Recipe"].waitForExistence(timeout: 15))
    }

    private func openEdit(_ app: XCUIApplication, recipe: Recipe) {
        let button = app.buttons["Edit recipe"]
        requireAction(button, in: app)
        button.tap()
        XCTAssertTrue(app.navigationBars["Edit recipe"].waitForExistence(timeout: 15))
        let loaded = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "value == %@", recipe.title), object: app.textFields["Name"])
        XCTAssertEqual(XCTWaiter.wait(for: [loaded], timeout: 30), .completed)
        XCTAssertFalse(app.navigationBars["Edit recipe"].buttons["Save"].isEnabled)
    }

    private func dirtyAndDiscard(_ title: String, baseline: String?, in app: XCUIApplication) {
        let raw = "0"
        let name = app.textFields["Servings"]
        reveal(name, in: app)
        name.tap()
        let keyboard = app.keyboards.firstMatch
        XCTAssertTrue(keyboard.waitForExistence(timeout: 15))
        if let baseline {
            XCTAssertEqual(name.value as? String, baseline.isEmpty ? "Servings" : baseline)
            let deletion = keyboard.keys["Delete"]
            XCTAssertTrue(deletion.exists && deletion.isEnabled && deletion.isHittable)
            capture(app, name: "Actual number-pad Delete key before local numeric draft")
            for _ in baseline { deletion.tap() }
        }
        name.typeText(raw)
        XCTAssertEqual(name.value as? String, raw)
        let done = app.buttons["Done"]
        requireAction(done, in: app)
        done.tap()
        XCTAssertEqual(disappearance(app.keyboards.firstMatch, timeout: 15), .completed)
        XCTAssertFalse(app.navigationBars[title].buttons["Save"].isEnabled)
        swipeSheet(title, dirty: true, in: app)
        let cancel = app.navigationBars[title].buttons["Cancel"]
        requireAction(cancel, in: app)
        cancel.tap()
        let alert = title == "New recipe" ? "Discard draft?" : "Discard changes?"
        let discard = title == "New recipe" ? "Discard draft" : "Discard changes"
        choose("Keep editing", alert: alert, in: app, name: title + " keeps invalid zero servings")
        XCTAssertEqual(name.value as? String, raw)
        XCTAssertFalse(app.navigationBars[title].buttons["Save"].isEnabled)
        capture(app, name: title + " retained invalid zero servings after Keep editing")
        cancel.tap()
        choose(discard, alert: alert, in: app, name: title + " explicitly discards local raw input")
        XCTAssertEqual(disappearance(app.navigationBars[title], timeout: 15), .completed)
    }

    private func swipeSheet(_ title: String, dirty: Bool, in app: XCUIApplication) {
        let bar = app.navigationBars[title]
        XCTAssertTrue(bar.exists && bar.isHittable)
        let frame = bar.frame
        let start = CGPoint(x: frame.midX, y: frame.minY + 8)
        let end = CGPoint(x: frame.midX, y: app.frame.maxY - 45)
        XCTAssertTrue(frame.contains(start) && app.frame.contains(end))
        attach(
            [
                "navigationBar": rect(frame), "app": rect(app.frame), "dirty": dirty,
                "gestureStart": [start.x, start.y], "gestureEnd": [end.x, end.y],
            ], name: title + " measured sheet dismissal gesture")
        app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: start.x, dy: start.y))
            .press(
                forDuration: 0.1,
                thenDragTo: app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: end.x, dy: end.y)),
                withVelocity: .slow, thenHoldForDuration: 0.2)
        capture(app, name: title + (dirty ? " dirty swipe retains raw servings" : " pristine swipe dismisses"))
        if dirty {
            XCTAssertTrue(bar.exists)
            XCTAssertEqual(app.textFields["Servings"].value as? String, "0")
            XCTAssertFalse(bar.buttons["Save"].isEnabled)
        } else {
            XCTAssertEqual(disappearance(bar, timeout: 10), .completed)
        }
    }

    private func verifyRecipe(_ recipe: Recipe, in app: XCUIApplication) {
        for (label, value) in [
            ("Name", recipe.title), ("Servings", recipe.servings.map(String.init) ?? ""),
            ("Cooking instructions", recipe.instructions ?? ""),
        ] {
            let field = app.textFields[label]
            reveal(field, in: app)
            XCTAssertEqual(field.value as? String, value.isEmpty ? label : value)
        }
    }

    private func cancelPristine(_ title: String, in app: XCUIApplication) {
        let button = app.navigationBars[title].buttons["Cancel"]
        requireAction(button, in: app)
        capture(app, name: title + " pristine Cancel closes directly")
        button.tap()
        XCTAssertEqual(disappearance(app.navigationBars[title], timeout: 10), .completed)
        XCTAssertFalse(app.alerts["Discard draft?"].exists)
        XCTAssertFalse(app.alerts["Discard changes?"].exists)
    }

    private func choose(_ action: String, alert title: String, in app: XCUIApplication, name: String) {
        let alert = app.alerts[title]
        XCTAssertTrue(alert.waitForExistence(timeout: 15))
        let discard = title == "Discard draft?" ? "Discard draft" : "Discard changes"
        var frames: [[String: Any]] = []
        for label in ["Keep editing", discard] {
            let button = alert.buttons[label]
            requireAction(button, in: app)
            XCTAssertTrue(app.frame.intersection(alert.frame).contains(button.frame))
            frames.append(["label": label, "frame": rect(button.frame)])
        }
        attach(["app": rect(app.frame), "alert": rect(alert.frame), "actions": frames], name: name + " full frames")
        capture(app, name: name)
        alert.buttons[action].tap()
        XCTAssertFalse(alert.exists)
    }

    private func requireAction(_ button: XCUIElement, in app: XCUIApplication) {
        XCTAssertTrue(button.exists && button.isEnabled && button.isHittable)
        XCTAssertTrue(app.frame.contains(button.frame))
        XCTAssertGreaterThanOrEqual(button.frame.width, 44 - 0.001)
        XCTAssertGreaterThanOrEqual(button.frame.height, 44 - 0.001)
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<24 {
            let bars = app.navigationBars.allElementsBoundByIndex
            let top = bars.first(where: { $0.isHittable })?.frame.maxY ?? 80
            let modal = app.navigationBars["New recipe"].exists || app.navigationBars["Edit recipe"].exists
            let bottom = modal ? app.frame.maxY - 40 : app.tabBars.firstMatch.frame.minY - 8
            let frame = element.exists ? element.frame : .zero
            if element.exists && element.isHittable && frame.minY >= top && frame.maxY <= bottom { return }
            let delta = frame.isEmpty ? 250 : (frame.minY < top ? frame.minY - top - 20 : frame.maxY - bottom + 20)
            let distance = max(-180, min(250, delta))
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.04, dy: 0.65 - distance / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        capture(app, name: "Recipe form target placement failure")
        XCTFail("Exact native recipe target must be fully visible")
    }

    private func disappearance(_ element: XCUIElement, timeout: TimeInterval) -> XCTWaiter.Result {
        let gone = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: element)
        return XCTWaiter.wait(for: [gone], timeout: timeout)
    }

    private func authorized(phase: String) throws -> Recipe {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RECIPE_CANCEL_UI"] == "20261006" else {
                throw XCTSkip("Requires dated recipe Cancel draft verification.")
            }
            XCTAssertEqual(env["SIMULATOR_UDID"], "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A")
            XCTAssertEqual(env["NEST_QA_RECIPE_CANCEL_PHASE"], phase)
            XCTAssertEqual(env["NEST_QA_RECIPE_CANCEL_DEFINITION_ID"], "1f5b84c0-8ecb-4f5d-ad33-0a60088b239b")
            XCTAssertEqual(env["NEST_QA_RECIPE_CANCEL_NAME"], "Test Alex")
            XCTAssertTrue(["normal_light", "maximum_dark"].contains(env["NEST_QA_RECIPE_CANCEL_PROFILE"] ?? ""))
            XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
            XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
            XCTAssertEqual(env["NEST_QA_PUSH_ENABLED"], "false")
            let raw = try XCTUnwrap(env["NEST_QA_RECIPE_CANCEL_RECIPE_JSON"])
            return try JSONDecoder().decode(Recipe.self, from: Data(raw.utf8))
        #else
            throw XCTSkip("Fictional recipe draft verification is forbidden on physical phones.")
        #endif
    }

    private func finish(_ app: XCUIApplication) {
        app.navigationBars["Saved meals"].buttons.element(boundBy: 0).tap()
        app.tabBars.firstMatch.buttons["Today"].tap()
        for _ in 0..<12 {
            if app.staticTexts["Today"].firstMatch.isHittable && app.staticTexts["Today"].firstMatch.frame.minY < 180 {
                break
            }
            app.swipeDown(velocity: .fast)
        }
        XCTAssertTrue(app.buttons["Me + shared"].isSelected)
        capture(app, name: "Restored Today after recipe drafts")
    }

    private func rect(_ frame: CGRect) -> [CGFloat] { [frame.minX, frame.minY, frame.width, frame.height] }
    private func attach(_ value: Any, name: String) {
        guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else { return }
        let item = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        item.name = name
        item.lifetime = .keepAlways
        add(item)
    }
    private func capture(_ app: XCUIApplication, name: String) {
        let item = XCTAttachment(screenshot: app.screenshot())
        item.name = name
        item.lifetime = .keepAlways
        add(item)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + " accessibility tree"
        tree.lifetime = .keepAlways
        add(tree)
    }
}
