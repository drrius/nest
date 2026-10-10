import XCTest

@testable import NestCore

final class MoneyTimeTests: XCTestCase {
    func testRetainedFinancialDatesAndExactOrdering() {
        for date in ["infinity", "-infinity", "5874897-12-31", "4713-01-01 BC", "0001-02-29 BC", "2024-02-29"] {
            XCTAssertTrue(MoneyTime.date(date), date)
        }
        for date in ["0000-01-01", "2026-02-29", "1900-02-29", "5874898-01-01", "4714-01-01 BC", "2026-01-01\n"] {
            XCTAssertFalse(MoneyTime.date(date), date)
        }
        XCTAssertTrue(MoneyTime.timestamp("294276-12-31T23:59:59.999999Z"))
        XCTAssertFalse(MoneyTime.timestamp("294277-01-01T00:00:00.000000Z"))
        XCTAssertFalse(MoneyTime.timestamp("2026-01-01T24:00:00.000000Z"))
        XCTAssertFalse(MoneyTime.order("-0"))
        XCTAssertFalse(MoneyTime.order("01"))
        let ordered = [
            "-infinity", "-99999999999999999999", "-10", "-1", "0", "1", "10", "99999999999999999999", "infinity",
        ]
        for (index, left) in ordered.enumerated() {
            XCTAssertTrue(MoneyTime.order(left))
            for (other, right) in ordered.enumerated() {
                XCTAssertEqual(MoneyTime.compare(left, right), index == other ? 0 : index > other ? 1 : -1)
            }
        }
    }
}
