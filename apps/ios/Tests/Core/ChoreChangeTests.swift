import Foundation
import XCTest

@testable import NestCore

final class ChoreChangeTests: XCTestCase {
    func testWireFieldsAndReceiptBindingForSkipAndReschedule() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let original = try CivilDate("2026-09-28")
        for next: CivilDate? in [nil, try CivilDate("2026-10-01")] {
            let command = ChoreChangeCommand(
                operationId: UUID(), occurrenceId: UUID(), expectedDueDate: original, newDueDate: next)
            let data = try JSONEncoder().encode(command.validated())
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertNil(object["action"])
            XCTAssertEqual(object["newDueDate"] as? String, next?.value)
            XCTAssertEqual(try JSONDecoder().decode(ChoreChangeCommand.self, from: data), command)
            let receipt = ChoreChangeReceipt(
                actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, occurrenceId: command.occurrenceId,
                previousDueDate: original, dueDate: next ?? original, action: command.action,
                status: next == nil ? "skipped" : "open")
            XCTAssertEqual(try receipt.validated(member: member, command: command), receipt)
            let wrongTarget = ChoreChangeCommand(
                operationId: command.operationId, occurrenceId: UUID(), expectedDueDate: original, newDueDate: next)
            XCTAssertThrowsError(try receipt.validated(member: member, command: wrongTarget))
            let wrongDate = ChoreChangeCommand(
                operationId: command.operationId, occurrenceId: command.occurrenceId,
                expectedDueDate: try CivilDate("2026-09-27"), newDueDate: next)
            XCTAssertThrowsError(try receipt.validated(member: member, command: wrongDate))
            let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
            XCTAssertThrowsError(try receipt.validated(member: other, command: command))
        }
        XCTAssertThrowsError(
            try ChoreChangeCommand(
                operationId: UUID(), occurrenceId: UUID(), expectedDueDate: original, newDueDate: original
            ).validated())
    }
}
