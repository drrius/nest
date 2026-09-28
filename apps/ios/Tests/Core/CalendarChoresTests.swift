import Foundation
import XCTest

@testable import NestCore

final class CalendarChoresTests: XCTestCase {
    func testDayHouseholdAndUniqueOccurrencesAreBound() throws {
        let household = UUID()
        let date = try CivilDate("2026-09-28")
        let row = CalendarChore(
            occurrenceId: UUID(), routineId: UUID(), title: "Vacuum",
            dueDate: date, assigneeId: nil, offlineEpoch: nil, role: .preview)
        let result = CalendarChores(version: 1, householdId: household, date: date, chores: [row])
        XCTAssertEqual(try result.validated(household: household, day: date).chores.count, 1)
        XCTAssertThrowsError(try result.validated(household: UUID(), day: date))
        XCTAssertThrowsError(try result.validated(household: household, day: CivilDate("2026-09-29")))
        XCTAssertThrowsError(
            try CalendarChores(
                version: 1, householdId: household, date: date,
                chores: [row, row]
            ).validated(household: household, day: date))
    }
}
