import Foundation
import XCTest

@testable import NestCore

final class RoutineEditTests: XCTestCase {
    func testPatchOmitsUntouchedHistoryAndPreservesExactRevision() throws {
        let command = EditRoutine(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z",
            patch: RoutinePatch(title: nil, schedule: .daily, assignment: nil))
        let data = try JSONEncoder().encode(command.validated())
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        let patch = try XCTUnwrap(object["patch"] as? [String: Any])
        XCTAssertEqual(Set(patch.keys), ["schedule"])
        XCTAssertEqual(object["expectedVersion"] as? String, command.expectedVersion)
        XCTAssertEqual(try JSONDecoder().decode(EditRoutine.self, from: data).validated(), command)
        for title in ["", "  ", String(repeating: "😀", count: 61), "a\0b"] {
            XCTAssertThrowsError(try RoutinePatch(title: title, schedule: nil, assignment: nil).validated())
        }
        XCTAssertThrowsError(try RoutinePatch(title: nil, schedule: nil, assignment: nil).validated())
        XCTAssertThrowsError(try RoutinePatch(title: nil, schedule: .weekdays([]), assignment: nil).validated())
        let rounded = EditRoutine(
            operationId: command.operationId, routineId: command.routineId,
            expectedVersion: "2026-09-28T09:00:00.123Z", patch: command.patch)
        XCTAssertThrowsError(try rounded.validated())
    }

    func testEditReceiptCannotSubstituteActorHouseholdOperationTargetOrAction() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = EditRoutine(
            operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z",
            patch: RoutinePatch(title: "New title", schedule: nil, assignment: nil))
        func receipt(_ field: String) -> RoutineCreateReceipt {
            RoutineCreateReceipt(
                actorId: field == "actor" ? UUID() : member.userId,
                householdId: field == "household" ? UUID() : member.householdId,
                operationId: field == "operation" ? UUID() : command.operationId,
                routineId: field == "target" ? UUID() : command.routineId,
                version: field == "version" ? "infinity" : "2026-09-28T09:00:01.123457Z",
                action: field == "action" ? "create" : "edit")
        }
        XCTAssertEqual(try receipt("").validated(member: member, command: command), receipt(""))
        for field in ["actor", "household", "operation", "target", "version", "action"] {
            XCTAssertThrowsError(try receipt(field).validated(member: member, command: command))
        }
    }
}
