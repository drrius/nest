import Foundation
import XCTest

@testable import NestCore

final class BusySnapshotTests: XCTestCase {
    func testFreshnessCoverageAndMissingActorRemainUnknown() throws {
        let actor = UUID()
        let row = BusySnapshot(
            actorId: actor, schemaVersion: 1, consent: "1", generation: "2",
            capturedAt: "2026-09-28T12:00:00Z", expiresAt: "2026-09-28T12:15:00Z",
            covered: .init(start: 100, end: 1000), intervals: [.init(start: 200, end: 300)])
        let now = try BusyCapture.timestamp("2026-09-28T12:10:00Z")
        XCTAssertEqual(row.state(for: .init(start: 200, end: 300), now: now), .busy)
        XCTAssertEqual(row.state(for: .init(start: 300, end: 400), now: now), .free)
        XCTAssertEqual(row.state(for: .init(start: 0, end: 200), now: now), .unknown)
        XCTAssertEqual(row.state(for: row.covered, now: try BusyCapture.timestamp(row.expiresAt)), .unknown)
        XCTAssertEqual(
            row.state(for: row.covered, now: try BusyCapture.timestamp(row.capturedAt).addingTimeInterval(-1)), .unknown
        )
        let household = UUID()
        let envelope = BusySnapshotsEnvelope(version: 1, householdId: household, snapshots: [row])
        _ = try envelope.validated(household: household)
        XCTAssertEqual(envelope.state(for: UUID(), query: row.covered, now: now), .unknown)
        XCTAssertThrowsError(try envelope.validated(household: UUID()))
        XCTAssertThrowsError(
            try BusySnapshotsEnvelope(
                version: 1, householdId: household, snapshots: [row, row]
            ).validated(household: household))
    }
}
