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
        for _ in 0..<12 {
            if element.exists && element.isHittable { return }
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
            start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.2)
        }
        add(XCTAttachment(screenshot: app.screenshot()))
        XCTFail("Could not reach the PDF picker control")
    }
}
