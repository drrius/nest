import Foundation
import XCTest

@testable import NestCore

final class CalendarRenewalsTests: XCTestCase {
    func testDeadlineDateBindingOrderingAndCursorValidation() throws {
        let household = UUID()
        let day = try CivilDate("2026-02-28")
        let renewal = CalendarRenewal(
            renewalId: UUID(), revision: UUID(),
            fields: .init(
                title: "Insurance", renewalOn: try CivilDate("2026-03-01"), noticeDays: 1,
                responsibleId: nil, recurringRuleId: nil), cancellationOn: day, removed: false)
        let page = CalendarRenewals(
            version: 1, householdId: household, date: day, after: nil, next: nil, renewals: [renewal])
        XCTAssertNoThrow(try page.validated(household: household, day: day, cursor: nil))
        XCTAssertThrowsError(try page.validated(household: UUID(), day: day, cursor: nil))
        XCTAssertThrowsError(try page.validated(household: household, day: try CivilDate("2026-03-01"), cursor: nil))
        XCTAssertThrowsError(try page.validated(household: household, day: day, cursor: UUID()))
        let duplicate = CalendarRenewals(
            version: 1, householdId: household, date: day, after: nil, next: nil,
            renewals: [renewal, renewal])
        XCTAssertThrowsError(try duplicate.validated(household: household, day: day, cursor: nil))
        let invalidNext = CalendarRenewals(
            version: 1, householdId: household, date: day, after: nil,
            next: renewal.id, renewals: [renewal])
        XCTAssertThrowsError(try invalidNext.validated(household: household, day: day, cursor: nil))
        let wrongDeadline = CalendarRenewal(
            renewalId: renewal.id, revision: renewal.revision,
            fields: renewal.fields, cancellationOn: try CivilDate("2026-02-27"), removed: false)
        XCTAssertFalse(wrongDeadline.valid(on: try CivilDate("2026-03-01")))
    }
}
