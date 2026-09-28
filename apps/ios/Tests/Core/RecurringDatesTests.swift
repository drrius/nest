import Foundation
import XCTest

@testable import NestCore

final class RecurringDatesTests: XCTestCase {
    func testMonthEndsCoverageCadenceChangesAndRangeExhaustion() throws {
        let monthly = RecurringSchedule(kind: .monthly, weekday: nil, dayOfMonth: 31)
        let weekly = RecurringSchedule(kind: .weekly, weekday: 1, dayOfMonth: nil)
        func check(_ schedule: RecurringSchedule, _ from: String, _ covered: String?, _ expected: String?) throws {
            let value = try RecurringDates.firstUncovered(
                schedule: schedule, from: CivilDate(from), coveredThrough: covered.map(CivilDate.init))
            XCTAssertEqual(value?.value, expected)
        }
        try check(monthly, "2024-02-01", nil, "2024-02-29")
        try check(monthly, "2025-02-01", nil, "2025-02-28")
        try check(monthly, "2026-09-28", "2026-09-15", "2026-10-31")
        try check(weekly, "2026-09-28", "2026-09-30", "2026-10-05")
        try check(monthly, "9999-12-31", "9999-12-31", nil)
        try check(weekly, "9999-12-31", nil, nil)
        for year in 2020...2030 {
            for month in 1...12 {
                let from = try CivilDate(String(format: "%04d-%02d-01", year, month))
                let due = try XCTUnwrap(
                    RecurringDates.firstUncovered(schedule: monthly, from: from, coveredThrough: nil))
                XCTAssertGreaterThanOrEqual(due.value, from.value)
                XCTAssertEqual(String(due.value.prefix(7)), String(from.value.prefix(7)))
            }
        }
    }
}
