import Foundation
import XCTest

@testable import NestCore

final class CivilDateLocalDayTests: XCTestCase {
    func testDayPreservesCivilDateAcrossZonesAndClockChanges() throws {
        for name in ["Europe/Zurich", "America/Los_Angeles", "Pacific/Kiritimati"] {
            let zone = try XCTUnwrap(TimeZone(identifier: name))
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = zone
            for text in ["2026-03-29", "2026-10-25", "2099-01-01"] {
                let civil = try CivilDate(text)
                let date = try XCTUnwrap(civil.localDay(timeZone: zone))
                let formatter = DateFormatter()
                formatter.calendar = calendar
                formatter.locale = Locale(identifier: "en_US_POSIX")
                formatter.timeZone = zone
                formatter.dateFormat = "yyyy-MM-dd"
                XCTAssertEqual(formatter.string(from: date), text)
                XCTAssertEqual(calendar.component(.hour, from: date), 12)
            }
        }
        let skippedDay = try CivilDate("2011-12-30")
        XCTAssertNil(skippedDay.localDay(timeZone: try XCTUnwrap(TimeZone(identifier: "Pacific/Apia"))))
    }
}
