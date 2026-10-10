import Foundation
import XCTest

@testable import NestCore

final class RecurringCommandTests: XCTestCase {
    func testVariableWireNullsAndDueScheduleValidation() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let config = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-09-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let input = RecurringInput(
            ruleId: UUID(), expectedRevision: nil, configuration: config, firstDueOn: try CivilDate("2026-09-28"))
        try input.validated(member: member)
        let data = try JSONEncoder().encode(input)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(json["expectedRevision"] is NSNull)
        let fields = try XCTUnwrap(json["configuration"] as? [String: Any])
        for key in ["categoryId", "note", "amountCentimes", "allocations"] { XCTAssertTrue(fields[key] is NSNull) }
        XCTAssertEqual(try JSONDecoder().decode(RecurringInput.self, from: data), input)
        XCTAssertThrowsError(
            try RecurringInput(
                ruleId: input.ruleId, expectedRevision: nil, configuration: config,
                firstDueOn: CivilDate("2026-09-29")
            ).validated(member: member))
    }
}
