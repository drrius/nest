import Foundation
import XCTest

@testable import NestCore

final class RoutineCancellationTests: XCTestCase {
    func testCancellationRequiresExactIdentityAndConsistentReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        let receipt = RoutineCreateReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            routineId: UUID(), version: "2026-09-28T09:00:00.123456Z", action: "create")
        func result(_ status: RoutineCancellation.Status, _ receipt: RoutineCreateReceipt?) -> RoutineCancellation {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, status: status, receipt: receipt)
        }
        XCTAssertEqual(try result(.cancelled, nil).validated(member: member, command: command).status, .cancelled)
        XCTAssertEqual(try result(.recorded, receipt).validated(member: member, command: command).receipt, receipt)
        XCTAssertThrowsError(try result(.cancelled, receipt).validated(member: member, command: command))
        XCTAssertThrowsError(try result(.recorded, nil).validated(member: member, command: command))
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        XCTAssertThrowsError(try result(.cancelled, nil).validated(member: other, command: command))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Foreign")
        XCTAssertThrowsError(try result(.cancelled, nil).validated(member: foreign, command: command))
        let changed = try CreateRoutine(operationId: UUID(), title: "Tidy", schedule: .daily, assignment: .shared)
        XCTAssertThrowsError(try result(.cancelled, nil).validated(member: member, command: changed))
        let wrong = RoutineCreateReceipt(
            actorId: UUID(), householdId: member.householdId, operationId: command.operationId,
            routineId: receipt.routineId, version: receipt.version, action: "create")
        XCTAssertThrowsError(try result(.recorded, wrong).validated(member: member, command: command))
    }
}
