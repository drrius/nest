import XCTest

@MainActor
final class NativeChorePairRoutineTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedAlternatingRoutineIsReadable() throws {
        let fixture = try NativeChorePairFixture()
        let app = fixture.openRoutines()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        fixture.reveal(row, in: app)
        XCTAssertTrue(row.isHittable)
        XCTAssertTrue(row.label.contains("Every day"))
        XCTAssertTrue(row.label.contains("Taking turns · starts with Test Alex"))
        fixture.finish(app, backs: 1)
    }

    func testCreateOwnedAlternatingDailyChoreOnce() throws {
        let fixture = try NativeChorePairFixture(action: "create")
        XCTAssertEqual(fixture.name, "Test Alex")
        let app = fixture.openRoutines()
        XCTAssertFalse(app.staticTexts[fixture.title].exists)
        app.buttons["Add chore"].tap()
        XCTAssertTrue(app.navigationBars["Add chore"].waitForExistence(timeout: 15))
        let title = app.textFields["What needs doing?"]
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        title.tap()
        title.typeText(fixture.title)
        let dismissKeyboard = app.buttons["Dismiss keyboard"]
        XCTAssertTrue(dismissKeyboard.waitForExistence(timeout: 15))
        XCTAssertTrue(dismissKeyboard.isHittable)
        dismissKeyboard.tap()
        let keyboardHidden = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [keyboardHidden], timeout: 15), .completed)
        choose("Repeat", value: "Every day", in: app, fixture: fixture)
        choose("Assignment", value: "Take turns", in: app, fixture: fixture)
        choose("First turn", value: "Test Alex", in: app, fixture: fixture)
        let add = app.buttons["Add chore"]
        fixture.reveal(add, in: app)
        XCTAssertTrue(add.isEnabled && add.isHittable)
        add.tap()
        XCTAssertTrue(app.staticTexts["Your household chore was saved."].waitForExistence(timeout: 30))
        let done = app.buttons["Done"]
        fixture.reveal(done, in: app)
        done.tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        fixture.finish(app, backs: 1)
    }

    func testEditTitleReturnDismissesKeyboardWithoutSaving() throws {
        let fixture = try NativeChorePairFixture(action: "edit_keyboard")
        let app = fixture.openRoutines()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        fixture.reveal(row, in: app)
        row.tap()
        app.buttons["Edit chore"].tap()
        XCTAssertTrue(app.navigationBars["Edit chore"].waitForExistence(timeout: 15))
        let title = app.textFields["What needs doing?"]
        XCTAssertTrue(title.waitForExistence(timeout: 15))
        XCTAssertEqual(title.value as? String, fixture.title)
        title.tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15))
        title.typeText("\n")
        let keyboardHidden = XCTNSPredicateExpectation(
            predicate: NSPredicate(format: "exists == false"), object: app.keyboards.firstMatch)
        XCTAssertEqual(XCTWaiter.wait(for: [keyboardHidden], timeout: 15), .completed)
        XCTAssertEqual(title.value as? String, fixture.title)
        XCTAssertFalse(app.buttons["Save changes"].isEnabled)
        app.navigationBars["Edit chore"].buttons["Back"].tap()
        XCTAssertTrue(app.navigationBars["Chore"].waitForExistence(timeout: 15))
        fixture.finish(app, backs: 2)
    }

    func testArchiveOwnedChoreNormally() throws {
        let fixture = try NativeChorePairFixture(action: "archive")
        let app = fixture.openRoutines()
        let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", fixture.title)).firstMatch
        fixture.reveal(row, in: app)
        XCTAssertTrue(row.isHittable)
        row.tap()
        let archive = app.buttons["Archive chore"]
        XCTAssertTrue(archive.waitForExistence(timeout: 15))
        fixture.reveal(archive, in: app)
        archive.tap()
        let confirm = app.buttons["Archive"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        confirm.tap()
        XCTAssertTrue(app.staticTexts["Change saved."].waitForExistence(timeout: 30))
        app.buttons["Done"].tap()
        XCTAssertTrue(app.navigationBars["Household chores"].waitForExistence(timeout: 15))
        fixture.finish(app, backs: 1)
    }

    private func choose(_ label: String, value: String, in app: XCUIApplication, fixture: NativeChorePairFixture) {
        let picker = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
        fixture.reveal(picker, in: app)
        XCTAssertTrue(picker.isHittable)
        picker.tap()
        let choice = app.buttons[value]
        XCTAssertTrue(choice.waitForExistence(timeout: 15))
        choice.tap()
    }
}
