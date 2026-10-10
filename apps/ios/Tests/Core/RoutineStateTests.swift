import Foundation
import XCTest

@testable import NestCore

final class RoutineStateTests: XCTestCase {
    func testExactRevisionAndActionsRoundTripAndReceiptIsBoundToTarget() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        for action: RoutineStateCommand.Action in [.pause, .resume, .archive] {
            let command = RoutineStateCommand(
                operationId: UUID(), routineId: UUID(), expectedVersion: "2026-09-28T09:00:00.123456Z", action: action)
            let decoded = try JSONDecoder().decode(RoutineStateCommand.self, from: JSONEncoder().encode(command))
            XCTAssertEqual(try decoded.validated(), command)
            let receipt = RoutineCreateReceipt(
                actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
                routineId: command.routineId, version: "2026-09-28T09:00:01.123457Z", action: action.rawValue)
            XCTAssertEqual(try receipt.validated(member: member, command: command), receipt)
            let wrongTarget = RoutineStateCommand(
                operationId: command.operationId, routineId: UUID(), expectedVersion: command.expectedVersion,
                action: action)
            XCTAssertThrowsError(try receipt.validated(member: member, command: wrongTarget))
            let wrongAction = RoutineStateCommand(
                operationId: command.operationId, routineId: command.routineId,
                expectedVersion: command.expectedVersion,
                action: action == .pause ? .resume : .pause)
            XCTAssertThrowsError(try receipt.validated(member: member, command: wrongAction))
            let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
            XCTAssertThrowsError(try receipt.validated(member: other, command: command))
            let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
            XCTAssertThrowsError(try receipt.validated(member: foreign, command: command))
        }
        for version in ["infinity", "2026-09-28T09:00:00.123Z", "2026-02-30T09:00:00.123456Z"] {
            let bad = RoutineStateCommand(
                operationId: UUID(), routineId: UUID(), expectedVersion: version, action: .pause)
            XCTAssertThrowsError(try bad.validated())
        }
    }
}
