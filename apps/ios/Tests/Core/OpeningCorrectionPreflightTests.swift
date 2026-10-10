import Foundation
import XCTest

@testable import NestCore

final class OpeningCorrectionPreflightTests: XCTestCase {
    func testOpeningReplacementRequiresExactCurrentLineageAndPayer() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let event = UUID()
        let reversal = UUID()
        let current = try context(member: member, partner: partner, event: event, reversal: reversal)
        let input = CorrectionInput(
            sourceEventId: event, expectedReversalId: reversal,
            replacement: .opening(
                .init(
                    description: "Opening", amountCentimes: try Centimes("99"), payerId: partner,
                    date: try CivilDate("2026-10-01"), note: nil)))
        _ = try input.validated(member: member, context: current)
        for changed in [nil, UUID()] {
            let value = try context(member: member, partner: partner, event: event, reversal: changed)
            XCTAssertThrowsError(try input.validated(member: member, context: value))
        }
        let foreign = CorrectionInput(
            sourceEventId: event, expectedReversalId: reversal,
            replacement: .opening(
                .init(
                    description: "Opening", amountCentimes: try Centimes("99"), payerId: UUID(),
                    date: try CivilDate("2026-10-01"), note: nil)))
        XCTAssertThrowsError(try foreign.validated(member: member, context: current))
        let reverse = CorrectionInput(sourceEventId: event, expectedReversalId: nil, replacement: nil)
        XCTAssertThrowsError(try reverse.validated(member: member, context: current))
        let expense = ExpenseInput(
            description: "Expense", amountCentimes: try Centimes("101"), receiptPath: nil, receiptTotalCentimes: nil,
            payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: try CivilDate("2026-10-01"), note: nil, categoryId: nil)
        let wrongKind = CorrectionInput(sourceEventId: event, expectedReversalId: nil, replacement: .expense(expense))
        XCTAssertThrowsError(try wrongKind.validated(member: member, context: current))
    }

    private func context(member: VerifiedMember, partner: UUID, event: UUID, reversal: UUID?) throws
        -> CorrectionContext
    {
        let summary = MoneyEventSummary(
            eventId: event, kind: .openingBalance, occurredOn: "2026-09-28",
            createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1",
            description: "Opening", amountCentimes: try Centimes("101"), createdBy: member.userId,
            payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        let source = MoneyDetail(
            version: 1, householdId: member.householdId, event: summary,
            receiptTotalCentimes: nil, note: nil, category: nil, reversedById: reversal,
            shares: [
                .init(memberId: member.userId, allocatedCentimes: nil, deltaCentimes: try Centimes("101")),
                .init(memberId: partner, allocatedCentimes: nil, deltaCentimes: try Centimes("-101")),
            ])
        return .init(
            version: 1, householdId: member.householdId, source: source, hasActiveRefunds: false,
            hasOpeningSuccessor: false, canReverse: reversal == nil, canReplace: true)
    }
}
