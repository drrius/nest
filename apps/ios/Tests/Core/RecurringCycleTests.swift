import Foundation
import XCTest

@testable import NestCore

final class RecurringCycleTests: XCTestCase {
    func testCycleKeysStayBoundToCivilPeriods() throws {
        let monthly = try RecurringDates.cycle(
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 31), dueOn: CivilDate("2024-02-29"))
        XCTAssertEqual(monthly.key, "monthly:2024-02-01")
        XCTAssertEqual(monthly.through.value, "2024-02-29")
        let weekly = try RecurringDates.cycle(
            schedule: .init(kind: .weekly, weekday: 1, dayOfMonth: nil), dueOn: CivilDate("2026-09-28"))
        XCTAssertEqual(weekly.key, "weekly:2026-09-28")
        XCTAssertEqual(weekly.through.value, "2026-10-04")
        XCTAssertThrowsError(
            try RecurringDates.cycle(
                schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1), dueOn: CivilDate("2026-09-28")))
    }
}
