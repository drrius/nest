import XCTest

@MainActor
final class NativeMealLeftoversJourneyTests: XCTestCase {
    private let title = "Nest native manual week 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testAddOneOwnedCrossWeekLeftover() throws {
        try requireFixture(action: "add", name: "Test Alex")
        let app = try openWeek("19 Oct – 25 Oct", name: "Test Alex")
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        defer { returnToday(app) }
        let options = app.buttons["2026-10-19, Dinner: More options for \(title)"]
        try reading.reveal(options)
        try reading.requireTarget(options)
        options.tap()
        let leftovers = app.buttons["Plan leftovers"]
        XCTAssertTrue(leftovers.waitForExistence(timeout: 10))
        try reading.requireTarget(leftovers, bounds: app.frame)
        leftovers.tap()
        let navigation = app.navigationBars["Plan leftovers"]
        XCTAssertTrue(navigation.waitForExistence(timeout: 15))
        let next = app.buttons["Next destination week"]
        try reading.requireTarget(next, bounds: app.frame)
        next.tap()
        XCTAssertTrue(app.staticTexts["Week of 26 Oct"].waitForExistence(timeout: 15))
        let picker = app.buttons["meal-destination-slot-picker"]
        try reading.requireTarget(picker, bounds: app.frame)
        picker.tap()
        let lunch = app.buttons["Lunch"]
        XCTAssertTrue(lunch.waitForExistence(timeout: 10))
        try reading.requireTarget(lunch, bounds: app.frame)
        lunch.tap()
        let selectedState = XCTAttachment(string: app.debugDescription)
        selectedState.name = "Destination picker after selecting Lunch"
        selectedState.lifetime = .keepAlways
        add(selectedState)
        let returned = XCTNSPredicateExpectation(
            predicate: NSPredicate(
                format: "exists == true AND hittable == true AND (label CONTAINS %@ OR value CONTAINS %@)",
                "Lunch", "Lunch"),
            object: picker)
        XCTAssertEqual(XCTWaiter.wait(for: [returned], timeout: 15), .completed)
        let sheetReading = AssistantFinancialHistoryMaximumReading(
            app: app, test: self, minimumContentY: 40, contentIdentifier: "meal-destination-form")
        let explanation = "The original meal stays in your plan. Its recipe is copied to the leftovers."
        try sheetReading.read(explanation)
        let add = navigation.buttons["Add"]
        let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "enabled == true"), object: add)
        XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 30), .completed)
        try reading.requireTarget(add, bounds: app.frame)
        sheetReading.capture(add, name: "Exact cross-week leftovers Add before one tap")
        add.tap()
        let dismissed = XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: navigation)
        XCTAssertEqual(XCTWaiter.wait(for: [dismissed], timeout: 30), .completed)
        try reading.read("Monday · 19 Oct")
        let source = app.buttons["2026-10-19, Dinner: \(title), recipe details"]
        try reading.reveal(source)
        try reading.requireTarget(source)
        reading.capture(source, name: "Original meal retained after leftovers")
    }

    func testReadOwnedLeftoverRecipe() throws {
        let name = try requireEitherMember(action: "read")
        let app = try openWeek("26 Oct – 1 Nov", name: name)
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        defer { returnToday(app) }
        let meal = app.buttons["2026-10-26, Lunch: \(title), recipe details"]
        try reading.reveal(meal)
        try reading.requireTarget(meal)
        meal.tap()
        XCTAssertTrue(app.navigationBars["Planned meal"].waitForExistence(timeout: 20))
        try reading.read("Simmer the fictional ingredients.")
        try reading.read("Serves 2")
        try reading.read("200 g QA lentils")
        try reading.read("100 g QA rice")
        reading.capture(
            reading.element("Simmer the fictional ingredients."), name: "Leftover retained recipe instructions")
        let back = app.navigationBars["Planned meal"].buttons.element(boundBy: 0)
        try reading.requireTarget(back, bounds: app.frame)
        back.tap()
    }

    func testRemoveOnlyOwnedLeftover() throws {
        try requireFixture(action: "remove", name: "Test Sam")
        let app = try openWeek("26 Oct – 1 Nov", name: "Test Sam")
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        defer { returnToday(app) }
        let options = app.buttons["2026-10-26, Lunch: More options for \(title)"]
        try reading.reveal(options)
        try reading.requireTarget(options)
        options.tap()
        let remove = app.buttons["Remove"]
        XCTAssertTrue(remove.waitForExistence(timeout: 10))
        try reading.requireTarget(remove, bounds: app.frame)
        remove.tap()
        let confirmation = app.buttons["Remove \(title)"]
        XCTAssertTrue(confirmation.waitForExistence(timeout: 10))
        try reading.requireTarget(confirmation, bounds: app.frame)
        reading.capture(confirmation, name: "Exact owned leftover removal confirmation")
        confirmation.tap()
        let empty = app.buttons["2026-10-26, Lunch: Add meal"]
        XCTAssertTrue(empty.waitForExistence(timeout: 30))
        try reading.reveal(empty)
        try reading.requireTarget(empty)
        reading.capture(empty, name: "Leftover destination empty after normal removal")
    }

    private func openWeek(_ heading: String, name: String) throws -> XCUIApplication {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        tabs.buttons["Today"].tap()
        let reading = AssistantFinancialHistoryMaximumReading(app: app, test: self, minimumContentY: 40)
        let profile = app.buttons["tab-profile-action"]
        try reading.requireTarget(profile, bounds: app.frame)
        profile.tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 20))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        tabs.buttons["Meals"].tap()
        for _ in 0..<4 {
            if app.staticTexts[heading].exists { return app }
            let next = app.buttons["Next week"]
            try reading.reveal(next)
            try reading.requireTarget(next)
            let old = app.staticTexts.matching(
                NSPredicate(format: "label MATCHES %@", "[0-9]+ [A-Za-z]+ – [0-9]+ [A-Za-z]+")
            ).firstMatch
            let previous = try XCTUnwrap(old.exists ? old.label : nil)
            next.tap()
            let changed = XCTNSPredicateExpectation(
                predicate: NSPredicate(format: "exists == false"), object: app.staticTexts[previous])
            XCTAssertEqual(XCTWaiter.wait(for: [changed], timeout: 15), .completed)
        }
        XCTFail("Reserved week heading not reached")
        return app
    }

    private func returnToday(_ app: XCUIApplication) {
        let today = app.tabBars.firstMatch.buttons["Today"]
        if today.exists && today.isHittable { today.tap() }
    }

    private func requireEitherMember(action: String) throws -> String {
        let env = ProcessInfo.processInfo.environment
        let roles = [
            "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": "Test Alex",
            "CA0BCEDE-A297-493A-8921-9E31F8B65783": "Test Sam",
        ]
        let name = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
        try requireFixture(action: action, name: name)
        return name
    }

    private func requireFixture(action: String, name: String) throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_MEAL_LEFTOVERS"] == "20261007-owned-cross-week" else {
            throw XCTSkip("Explicit fictional leftover action; creation and removal each run once")
        }
        XCTAssertEqual(env["NEST_QA_LEFTOVERS_ACTION"], action)
        XCTAssertEqual(env["NEST_QA_NAME"], name)
        XCTAssertEqual(
            env["SIMULATOR_UDID"],
            name == "Test Alex" ? "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" : "CA0BCEDE-A297-493A-8921-9E31F8B65783")
        XCTAssertEqual(env["NEST_QA_SOURCE_ENTRY"], "f040105f-89b5-4370-aa2f-636c7c284be1")
        XCTAssertEqual(env["NEST_QA_HOUSEHOLD"], "be772ffd-3ab5-41d5-8438-647a79a553da")
        XCTAssertEqual(env["NEST_QA_TARGET_DATE"], "2026-10-26")
        XCTAssertEqual(env["NEST_QA_TARGET_SLOT"], "lunch")
        XCTAssertEqual(env["NEST_QA_POSITIVE_BUDGET"], action == "read" ? "0" : "1")
        XCTAssertEqual(env["NEST_QA_API_ORIGIN"], "https://nest-test-api-drrius-projects.vercel.app")
        XCTAssertEqual(env["NEST_QA_SUPABASE_ORIGIN"], "https://tkjixmujjoustdiedfmw.supabase.co")
    }
}
