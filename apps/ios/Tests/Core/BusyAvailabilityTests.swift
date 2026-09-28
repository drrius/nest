import Foundation
import XCTest

@testable import NestCore

final class BusyAvailabilityTests: XCTestCase {
    private let covered = BusyInterval(start: 100, end: 1000)

    func testClipsMergesAndExcludesFreeCancelledDeclinedAndUnselected() throws {
        let value = project([
            event(0, 200), event(200, 400), event(300, 500), event(900, 1100),
            event(600, 700, free: true), event(600, 700, cancelled: true),
            event(600, 700, declined: true), event(600, 700, calendar: "other"),
        ])
        XCTAssertEqual(
            value,
            .known(
                .init(
                    covered: covered, intervals: [.init(start: 100, end: 500), .init(start: 900, end: 1000)])))
        XCTAssertEqual(value.state(for: .init(start: 500, end: 900), capturedAt: 10, now: 11, maxAge: 10), .free)
        XCTAssertEqual(value.state(for: .init(start: 499, end: 900), capturedAt: 10, now: 11, maxAge: 10), .busy)
        XCTAssertEqual(value.state(for: covered, capturedAt: 10, now: 20, maxAge: 10), .unknown)
        XCTAssertEqual(value.state(for: covered, capturedAt: 10, now: 9, maxAge: 10), .unknown)
        XCTAssertEqual(value.state(for: .init(start: 0, end: 200), capturedAt: 10, now: 11, maxAge: 10), .unknown)
        guard case .known(let payload) = value else { return XCTFail("Expected known projection") }
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(payload)) as? [String: Any])
        XCTAssertEqual(Set(json.keys), ["covered", "intervals"])
    }

    func testUnavailableOrInvalidNeverMeansFree() {
        XCTAssertEqual(project([event(500, 400)]), .unknown)
        XCTAssertEqual(
            LocalAvailability.project(
                events: [], selected: [], available: ["selected"], permission: true, covered: covered), .unknown)
        XCTAssertEqual(
            LocalAvailability.project(
                events: [], selected: ["missing"], available: ["selected"], permission: true, covered: covered),
            .unknown)
        XCTAssertEqual(
            LocalAvailability.project(
                events: [], selected: ["selected"], available: ["selected"], permission: false, covered: covered),
            .unknown)
    }

    func testMergedCoverageMatchesInputAcrossGeneratedCases() {
        for seed in 0..<100 {
            let events = (0..<20).map { index in
                let start = Int64((seed * 73 + index * 137) % 1000)
                return event(start, start + Int64((index * 31 + seed) % 200 + 1))
            }
            guard case .known(let result) = project(events) else { return XCTFail("Unexpected unknown") }
            for (left, right) in zip(result.intervals, result.intervals.dropFirst()) {
                XCTAssertLessThan(left.end, right.start)
            }
            for point in stride(from: Int64(100), to: 1000, by: 7) {
                let inputBusy = events.contains { $0.interval.start <= point && $0.interval.end > point }
                let outputBusy = result.intervals.contains { $0.start <= point && $0.end > point }
                XCTAssertEqual(inputBusy, outputBusy)
            }
        }
    }

    private func project(_ events: [BusyEvent]) -> LocalAvailability {
        .project(events: events, selected: ["selected"], available: ["selected"], permission: true, covered: covered)
    }

    private func event(
        _ start: Int64, _ end: Int64, free: Bool = false, cancelled: Bool = false,
        declined: Bool = false, calendar: String = "selected"
    ) -> BusyEvent {
        .init(
            calendarId: calendar, interval: .init(start: start, end: end),
            free: free, cancelled: cancelled, declined: declined)
    }
}
