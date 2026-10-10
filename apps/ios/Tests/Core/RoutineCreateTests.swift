import Foundation
import XCTest

@testable import NestCore

final class RoutineCreateTests: XCTestCase {
    func testEveryScheduleUsesBackendWireFormatAndRoundTrips() throws {
        let cases: [(RoutineSchedule, String)] = [
            (.oneOff(try CivilDate("2026-10-01")), "one_off"), (.daily, "daily"),
            (.weekdays([1, 3, 7]), "weekdays"), (.weekly(7), "weekly"),
            (.biweekly(1), "biweekly"), (.monthly(31), "monthly"),
            (.afterCompletion(every: 2, unit: .weeks), "after_completion"),
        ]
        for (schedule, kind) in cases {
            let data = try JSONEncoder().encode(schedule)
            let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
            XCTAssertEqual(object["kind"] as? String, kind)
            XCTAssertEqual(try JSONDecoder().decode(RoutineSchedule.self, from: data), schedule)
        }
    }

    func testInvalidSchedulesCannotBeWrittenOrRecovered() throws {
        let invalid: [RoutineSchedule] = [
            .weekdays([]), .weekdays([1, 1]), .weekdays([0]), .weekly(8), .biweekly(0),
            .monthly(32), .afterCompletion(every: 0, unit: .days),
            .afterCompletion(every: 2_147_483_648, unit: .weeks),
        ]
        for schedule in invalid { XCTAssertThrowsError(try JSONEncoder().encode(schedule)) }
        let wire = Data(#"{"kind":"weekdays","days":[1,1]}"#.utf8)
        XCTAssertThrowsError(try JSONDecoder().decode(RoutineSchedule.self, from: wire))
    }

    func testTitleLimitMatchesUTF16BackendAndAssignmentIsPreserved() throws {
        let member = UUID()
        for assignment: RoutineAssignment in [.shared, .assigned(member), .alternating(member)] {
            let command = try CreateRoutine(
                operationId: UUID(), title: String(repeating: "🧹", count: 60),
                schedule: .daily, assignment: assignment)
            let restored = try JSONDecoder().decode(CreateRoutine.self, from: JSONEncoder().encode(command))
            XCTAssertEqual(try restored.validated(), command)
        }
        for title in ["  ", "bad\0title", String(repeating: "🧹", count: 61)] {
            XCTAssertThrowsError(
                try CreateRoutine(operationId: UUID(), title: title, schedule: .daily, assignment: .shared))
        }
    }

    func testReceiptRejectsOtherMemberHouseholdOperationAndNonCreation() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z", action: "create")
        XCTAssertEqual(try receipt.validated(member: member, command: command), receipt)
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try receipt.validated(member: other, command: command))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
        XCTAssertThrowsError(try receipt.validated(member: foreign, command: command))
        let unrelated = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        XCTAssertThrowsError(try receipt.validated(member: member, command: unrelated))
        for (version, action) in [("infinity", "create"), (receipt.version, "edit")] {
            let invalid = RoutineCreateReceipt(
                actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
                routineId: receipt.routineId, version: version, action: action)
            XCTAssertThrowsError(try invalid.validated(member: member, command: command))
        }
    }
}
