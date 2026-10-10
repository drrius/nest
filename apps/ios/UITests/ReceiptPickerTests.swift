import XCTest

@MainActor
final class ReceiptPickerTests: XCTestCase {
    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testPDFPickerCancellationPreservesUnattachedExpense() throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        _ = try openFixture(in: app)
        let back = app.buttons["On My iPhone"]
        XCTAssertTrue(back.exists)
        back.tap()
        XCTAssertTrue(app.staticTexts["Nest Receipt QA 20261005"].waitForExistence(timeout: 15))
        let cancel = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Cancel")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 15))
        XCTAssertEqual(app.frame.size, CGSize(width: 375, height: 667), "This manual check owns the SE3 fixture")
        // On iOS26.3 the stale Cancel AX frame overlaps More. Root browsing exposes the rendered X at this SE3 point.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.117)).tap()
        let choosePDF = app.buttons["Choose PDF"]
        let usable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isHittable == true"), object: choosePDF)
        XCTAssertEqual(XCTWaiter.wait(for: [usable], timeout: 15), .completed)
        XCTAssertFalse(
            app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Nest-QA-receipt")).firstMatch.exists)
        XCTAssertFalse(cancel.exists)
        XCTAssertFalse(app.staticTexts["Receipt attached"].exists)
        XCTAssertFalse(app.staticTexts["Upload pending"].exists)
        XCTAssertFalse(app.buttons["Remove receipt"].exists)
        XCTAssertFalse(
            app.staticTexts["Receipt not confirmed. Retry if it is pending, or choose a smaller photo or PDF."].exists)
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 15))
        tabs.buttons["Today"].tap()
        XCTAssertTrue(tabs.buttons["Today"].isSelected)
    }

    func testPDFUploadAndRemovalPreservesUnpostedExpense() throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let file = try openFixture(in: app)
        let cell = app.cells.containing(.staticText, identifier: file.label).firstMatch
        XCTAssertTrue(cell.exists)
        cell.tap()
        let attached = app.staticTexts["Receipt attached"]
        XCTAssertTrue(attached.waitForExistence(timeout: 60), "The real receipt API must confirm the upload")
        XCTAssertFalse(app.staticTexts["Upload pending"].exists)
        let remove = app.buttons["Remove receipt"]
        XCTAssertTrue(remove.isHittable)
        remove.tap()
        let choosePDF = app.buttons["Choose PDF"]
        let usable = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isHittable == true"), object: choosePDF)
        XCTAssertEqual(XCTWaiter.wait(for: [usable], timeout: 60), .completed)
        XCTAssertFalse(attached.exists)
        XCTAssertFalse(app.staticTexts["Removal pending"].exists)
        XCTAssertFalse(app.buttons["Retry removal"].exists)
        XCTAssertFalse(app.buttons["Remove receipt"].exists)
        XCTAssertFalse(
            app.staticTexts["Receipt not confirmed. Retry if it is pending, or choose a smaller photo or PDF."].exists)
        XCTAssertFalse(app.staticTexts["Removal is not confirmed yet. Retry removal when connected."].exists)
        let tabs = app.tabBars.firstMatch
        tabs.buttons["Today"].tap()
        XCTAssertTrue(tabs.buttons["Today"].isSelected)
    }

    func testPDFAttachmentPostsWithReviewedExpense() throws {
        guard ProcessInfo.processInfo.environment["NEST_QA_POST_PDF"] == "20261005" else {
            throw XCTSkip("Requires the separately authorized, one-time nest-test financial fixture")
        }
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let file = try openFixture(in: app)
        let cell = app.cells.containing(.staticText, identifier: file.label).firstMatch
        XCTAssertTrue(cell.exists)
        cell.tap()
        XCTAssertTrue(app.staticTexts["Receipt attached"].waitForExistence(timeout: 60))
        enter("Nest QA PDF posted 20261005", label: "Description", in: app)
        enter("0.02", label: "Shared amount (CHF)", in: app)
        let review = app.buttons["expense.keyboard-review"]
        XCTAssertTrue(review.isHittable)
        review.tap()
        XCTAssertTrue(app.staticTexts["Nest QA PDF posted 20261005"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Receipt attached"].exists)
        XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "0.02")).firstMatch.exists)
        let save = app.buttons["Save expense"]
        reveal(save, in: app)
        XCTAssertTrue(save.isEnabled)
        save.tap()
        XCTAssertTrue(app.staticTexts["Expense recorded."].waitForExistence(timeout: 60))
        let entry = app.buttons["View recorded entry"]
        reveal(entry, in: app)
        entry.tap()
        XCTAssertTrue(app.staticTexts["Nest QA PDF posted 20261005"].waitForExistence(timeout: 30))
        let receipt = app.buttons["View receipt"]
        reveal(receipt, in: app)
        XCTAssertGreaterThanOrEqual(receipt.frame.height, 44)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Posted synthetic PDF expense details"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        app.navigationBars["Entry details"].buttons.firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Expense recorded."].waitForExistence(timeout: 15))
        let finish = app.buttons["Start another expense"]
        reveal(finish, in: app)
        finish.tap()
        reveal(app.buttons["Choose PDF"], in: app)
        XCTAssertTrue(app.buttons["Choose PDF"].waitForExistence(timeout: 30))
        XCTAssertFalse(app.staticTexts["Receipt attached"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    func testExistingPostedPDFExpenseRemainsReachable() throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        _ = try openPostedPDFDetail(in: app)
        let tabs = app.tabBars.firstMatch
        defer {
            tabs.buttons["Today"].tap()
            XCTAssertTrue(tabs.buttons["Today"].isSelected)
        }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Existing synthetic PDF expense details"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    func testExistingPostedPDFBrowserOpensAndReturnsToEntry() throws {
        let app = XCUIApplication(bundleIdentifier: "ch.drrius.nest")
        let receipt = try openPostedPDFDetail(in: app)
        receipt.tap()
        let close = app.buttons.matching(NSPredicate(format: "label == %@ OR label == %@", "Close", "Done"))
            .firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 30), "The native receipt browser must expose dismissal")
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 30))
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Existing synthetic PDF native browser"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        XCTAssertGreaterThanOrEqual(close.frame.width, 44)
        XCTAssertGreaterThanOrEqual(close.frame.height, 44)
        close.tap()
        XCTAssertTrue(app.staticTexts["Nest QA PDF posted 20261005"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["View receipt"].exists)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func openPostedPDFDetail(in app: XCUIApplication) throws -> XCUIElement {
        guard ProcessInfo.processInfo.environment["NEST_QA_READ_POSTED_PDF"] == "20261005" else {
            throw XCTSkip("Requires the existing, separately verified nest-test PDF expense")
        }
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30))
        tabs.buttons["Money"].tap()
        let history = app.buttons["View full history"]
        reveal(history, in: app)
        history.tap()
        let entry = app.buttons.matching(
            NSPredicate(format: "label CONTAINS %@", "Nest QA PDF posted 20261005")
        ).firstMatch
        XCTAssertTrue(entry.waitForExistence(timeout: 30))
        reveal(entry, in: app)
        entry.tap()
        XCTAssertTrue(app.staticTexts["Nest QA PDF posted 20261005"].waitForExistence(timeout: 30))
        let receipt = app.buttons["View receipt"]
        reveal(receipt, in: app)
        XCTAssertGreaterThanOrEqual(receipt.frame.height, 44)
        return receipt
    }

    private func enter(_ value: String, label: String, in app: XCUIApplication) {
        let predicate = NSPredicate(
            format: "label == %@ AND (elementType == %d OR elementType == %d)", label,
            XCUIElement.ElementType.textField.rawValue, XCUIElement.ElementType.textView.rawValue)
        let field = app.descendants(matching: .any).matching(predicate).firstMatch
        for _ in 0..<12 {
            if field.exists && field.isHittable && field.frame.minY >= 60 {
                field.tap()
                field.typeText(value)
                return
            }
            app.swipeDown()
        }
        add(XCTAttachment(screenshot: app.screenshot()))
        XCTFail("Could not enter the synthetic expense field")
    }

    private func openFixture(in app: XCUIApplication) throws -> XCUIElement {
        app.launch()
        let tabs = app.tabBars.firstMatch
        XCTAssertTrue(tabs.waitForExistence(timeout: 30), "Requires an authorized test-member session")
        tabs.buttons["Money"].tap()
        let addExpense = app.buttons["Add expense"]
        XCTAssertTrue(addExpense.waitForExistence(timeout: 30))
        addExpense.tap()
        let choosePDF = app.buttons["Choose PDF"]
        reveal(choosePDF, in: app)
        XCTAssertFalse(app.staticTexts["Receipt attached"].exists)
        choosePDF.tap()
        let cancel = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "Cancel")).firstMatch
        XCTAssertTrue(cancel.waitForExistence(timeout: 15), "The native document picker must open")
        let initial = XCTAttachment(screenshot: app.screenshot())
        initial.name = "Native PDF picker before browsing"
        initial.lifetime = .keepAlways
        add(initial)
        if let browse = app.buttons.matching(identifier: "Browse").allElementsBoundByIndex.first(where: {
            $0.isHittable
        }) {
            browse.tap()
        }
        let local = app.staticTexts["On My iPhone"]
        XCTAssertTrue(local.waitForExistence(timeout: 15))
        local.tap()
        let folder = app.staticTexts["Nest Receipt QA 20261005"]
        XCTAssertTrue(folder.waitForExistence(timeout: 15))
        let folderCell = app.cells.containing(.staticText, identifier: "Nest Receipt QA 20261005").firstMatch
        let targets = app.descendants(matching: .any).matching(
            NSPredicate(format: "label CONTAINS %@", "Nest Receipt QA 20261005")
        ).allElementsBoundByIndex.map {
            [
                "label": $0.label, "type": String(describing: $0.elementType),
                "frame": [$0.frame.minX, $0.frame.minY, $0.frame.width, $0.frame.height],
            ] as [String: Any]
        }
        let diagnostic = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: targets, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        diagnostic.name = "Synthetic folder accessibility targets"
        diagnostic.lifetime = .keepAlways
        add(diagnostic)
        XCTAssertTrue(folderCell.exists, "The folder's native collection cell must exist")
        folderCell.tap()
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Synthetic PDF available in native picker"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let file = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Nest-QA-receipt"))
        XCTAssertTrue(file.firstMatch.waitForExistence(timeout: 15))
        XCTAssertEqual(file.count, 1)
        return file.firstMatch
    }

    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        for _ in 0..<32 {
            if element.exists && element.isHittable { return }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        add(XCTAttachment(screenshot: app.screenshot()))
        XCTFail("Could not reach the receipt workflow control")
    }
}
