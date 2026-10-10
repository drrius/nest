import Foundation
import XCTest

@testable import NestCore

final class TodayChoresTests: XCTestCase {
    func testTodayExcludesFutureButKeepsRecoveryAndHonorsAssignment() throws {
        let today = try CivilDate("2026-09-28")
        let actor = UUID()
        let partner = UUID()
        func item(_ date: String, _ assignee: UUID?, _ state: LocalChore.State = .open) throws -> LocalChore {
            LocalChore(
                chore: NestChore(
                    occurrenceId: UUID(), title: "Tidy", dueDate: try CivilDate(date), assigneeId: assignee,
                    offlineEpoch: nil),
                state: state, operationId: nil)
        }
        for date in ["2026-09-27", "2026-09-28"] {
            XCTAssertTrue(try item(date, actor).visibleToday(on: today, actor: actor, everyone: false))
            XCTAssertTrue(try item(date, nil).visibleToday(on: today, actor: actor, everyone: false))
            XCTAssertFalse(try item(date, partner).visibleToday(on: today, actor: actor, everyone: false))
            XCTAssertTrue(try item(date, partner).visibleToday(on: today, actor: actor, everyone: true))
        }
        XCTAssertFalse(try item("2099-01-01", nil).visibleToday(on: today, actor: actor, everyone: true))
        for state: LocalChore.State in [.pending, .conflict] {
            XCTAssertTrue(try item("2099-01-01", partner, state).visibleToday(on: today, actor: actor, everyone: false))
        }
    }
}
