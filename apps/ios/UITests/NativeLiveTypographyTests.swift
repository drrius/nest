import XCTest

@MainActor
final class NativeLiveTypographyTests: XCTestCase {
    private let directory = URL(fileURLWithPath: "/private/tmp/nest-live-typography-control-after1-20261006")
    private let labels = [
        "iOS calls this Full Access. Nest uses it only to read your calendars.",
        "Allow calendar access", "Test Sam’s busy times",
    ]

    func testCalendarTextRespondsWithoutRelaunch() throws {
        let fixture = try NativeMealWeekFixture(action: "live_typography")
        XCTAssertEqual(fixture.name, "Test Alex")
        guard ProcessInfo.processInfo.environment["NEST_QA_LIVE_TYPOGRAPHY"] == directory.path,
            FileManager.default.fileExists(atPath: directory.path)
        else { throw XCTSkip("Requires the exact owned simulator typography coordinator.") }
        let app = fixture.openMeals()
        app.tabBars.firstMatch.buttons["Calendar"].tap()
        XCTAssertTrue(app.buttons["Choose day"].waitForExistence(timeout: 30))
        var observations: [[String: Any]] = []
        for phase in 0..<3 {
            if phase > 0 { waitForCoordinator(phase) }
            let sample = measure(app, fixture: fixture, phase: phase)
            observations.append(sample)
            let data = try JSONSerialization.data(withJSONObject: sample, options: [.sortedKeys])
            try data.write(to: directory.appendingPathComponent("phase-\(phase).json"), options: .atomic)
            let capture = XCTAttachment(screenshot: app.screenshot())
            capture.name = "Live Calendar typography phase \(phase)"
            capture.lifetime = .keepAlways
            add(capture)
        }
        waitForCoordinator(3)
        app.terminate()
        app.launch()
        XCTAssertTrue(app.tabBars.firstMatch.waitForExistence(timeout: 30))
        app.tabBars.firstMatch.buttons["Calendar"].tap()
        observations.append(measure(app, fixture: fixture, phase: 3))
        try verify(observations)
        let report = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: observations, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        report.name = "Live and cold Calendar text bounds"
        report.lifetime = .keepAlways
        add(report)
        app.tabBars.firstMatch.buttons["Today"].tap()
        XCTAssertTrue(app.tabBars.firstMatch.buttons["Today"].isSelected)
    }

    private func verify(_ samples: [[String: Any]]) throws {
        let groups = try samples.map { try XCTUnwrap($0["elements"] as? [[String: Any]]) }
        XCTAssertEqual(groups.count, 4)
        for index in labels.indices {
            let frames = try groups.map { try XCTUnwrap($0[index]["frame"] as? [CGFloat]) }
            XCTAssertGreaterThan(frames[1][3], frames[0][3], labels[index] + " live growth")
            XCTAssertEqual(frames[2][3], frames[0][3], accuracy: 0.5, labels[index] + " restored size")
            XCTAssertEqual(frames[3][3], frames[1][3], accuracy: 0.5, labels[index] + " cold comparison")
        }
    }

    private func waitForCoordinator(_ phase: Int) {
        let file = directory.appendingPathComponent("advance-\(phase).json")
        let ready = XCTNSPredicateExpectation(
            predicate: NSPredicate { _, _ in FileManager.default.fileExists(atPath: file.path) }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 45), .completed)
    }

    private func measure(_ app: XCUIApplication, fixture: NativeMealWeekFixture, phase: Int) -> [String: Any] {
        var values: [[String: Any]] = []
        for label in labels {
            let element = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", label)).firstMatch
            fixture.reveal(element, in: app)
            XCTAssertTrue(element.exists && element.isHittable)
            let frame = element.frame
            values.append([
                "label": label, "frame": [frame.minX, frame.minY, frame.width, frame.height],
                "exists": element.exists,
            ])
        }
        return ["phase": phase, "elements": values]
    }
}
