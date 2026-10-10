import Foundation
import XCTest

@testable import NestCore

final class MemoryCommandTests: XCTestCase {
    func testDecisionCannotInvertConsentOrAcceptForeignReceipt() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approval = MemoryApproval(
            id: UUID(), operationId: UUID(),
            change: MemoryChange(memoryId: UUID(), expectedRevision: "2", content: "Exact approved text"),
            status: .pending, expiresAt: "2099-01-01T00:00:00Z")
        let command = DecideMemory(approval: approval, approved: true)
        XCTAssertEqual(command.content, approval.change.content)
        XCTAssertEqual(command.operationId, approval.operationId)
        func receipt(actor: UUID? = nil, revision: String = "3", removed: Bool = false) -> MemoryReceipt {
            MemoryReceipt(
                actorId: actor ?? member.userId, householdId: member.householdId,
                operationId: command.operationId, memoryId: command.memoryId, revision: revision, removed: removed)
        }
        func result(_ status: String, receipt: MemoryReceipt?) -> MemoryDecisionEnvelope {
            MemoryDecisionEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                decision: .init(status: status, receipt: receipt))
        }
        XCTAssertNoThrow(try result("consumed", receipt: receipt()).validated(member: member, command: command))
        XCTAssertThrowsError(
            try result("consumed", receipt: receipt(actor: UUID())).validated(member: member, command: command))
        XCTAssertThrowsError(
            try result("consumed", receipt: receipt(revision: "4")).validated(member: member, command: command))
        XCTAssertThrowsError(
            try result("consumed", receipt: receipt(removed: true)).validated(member: member, command: command))
        XCTAssertThrowsError(try result("denied", receipt: nil).validated(member: member, command: command))
        let denied = DecideMemory(approval: approval, approved: false)
        XCTAssertNoThrow(try result("denied", receipt: nil).validated(member: member, command: denied))
        XCTAssertThrowsError(try result("consumed", receipt: receipt()).validated(member: member, command: denied))
    }

    func testReceiptCannotOverflowOrAcknowledgeAnotherOperation() {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let operation = UUID()
        let memory = UUID()
        let receipt = MemoryReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: operation,
            memoryId: memory, revision: "2", removed: true)
        XCTAssertNoThrow(
            try receipt.validated(member: member, operation: operation, memory: memory, expected: "1", removed: true))
        XCTAssertThrowsError(
            try receipt.validated(member: member, operation: UUID(), memory: memory, expected: "1", removed: true))
        XCTAssertThrowsError(
            try receipt.validated(
                member: member, operation: operation, memory: memory, expected: "9223372036854775807", removed: true))
    }
}
