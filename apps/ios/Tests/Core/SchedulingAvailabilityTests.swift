import Foundation
import XCTest

@testable import NestCore

final class SchedulingAvailabilityTests: XCTestCase {
    func testOlderRefreshCannotReplaceNewerAvailabilityOrFinishItsLoading() {
        var state = SchedulingAvailability()
        let old = state.begin()
        state.setLocal(.busy, request: old)
        let current = state.begin()
        XCTAssertEqual(state.local, .unknown)
        state.setLocal(.free, request: current)
        state.setLocal(.busy, request: old)
        state.setSnapshots(.init(version: 1, householdId: UUID(), snapshots: []), request: old)
        state.finish(old)
        XCTAssertEqual(state.local, .free)
        XCTAssertNil(state.snapshots)
        XCTAssertTrue(state.loading)
        state.finish(current)
        XCTAssertFalse(state.loading)
    }

    func testLeavingForegroundInvalidatesInflightAvailability() {
        var state = SchedulingAvailability()
        let request = state.begin()
        state.setLocal(.busy, request: request)
        state.setSnapshots(.init(version: 1, householdId: UUID(), snapshots: []), request: request)
        state.clear()
        state.setLocal(.free, request: request)
        state.setSnapshots(.init(version: 1, householdId: UUID(), snapshots: []), request: request)
        XCTAssertEqual(state.local, .unknown)
        XCTAssertNil(state.snapshots)
        XCTAssertFalse(state.loading)
        XCTAssertFalse(state.isCurrent(request))
    }
}
