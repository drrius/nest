import Foundation
import XCTest

@testable import NestCore

final class CorrectionApprovalReplacementTests: XCTestCase {
    func testReplacementReceiptRequiresDistinctAndExpectedEntries() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let expense = ExpenseInput(
            description: "Replacement", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let input = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: .expense(expense))
        let approvalId = UUID()
        let operation = UUID()
        let reversal = UUID()
        func envelope(reversalId: UUID, replacementId: UUID?) -> CorrectionApprovalEnvelope {
            let receipt = CorrectionReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: operation, approvalId: approvalId, reversalEventId: reversalId,
                replacementEventId: replacementId, correction: input)
            return .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approval: .init(
                    id: approvalId, operationId: operation, correction: input, status: .consumed,
                    expiresAt: "2026-09-28T10:00:00.000000Z", receipt: receipt))
        }
        _ = try envelope(reversalId: reversal, replacementId: UUID()).validated(member: member, approvalId: approvalId)
        XCTAssertThrowsError(
            try envelope(reversalId: reversal, replacementId: nil).validated(member: member, approvalId: approvalId))
        XCTAssertThrowsError(
            try envelope(reversalId: reversal, replacementId: reversal).validated(
                member: member, approvalId: approvalId))
        XCTAssertThrowsError(
            try envelope(reversalId: input.sourceEventId, replacementId: UUID()).validated(
                member: member, approvalId: approvalId))
        XCTAssertThrowsError(
            try envelope(reversalId: reversal, replacementId: input.sourceEventId).validated(
                member: member, approvalId: approvalId))
    }
}
