import Foundation
import XCTest

@testable import NestCore

final class OpeningCorrectionTests: XCTestCase {
    func testOpeningReplacementBindsExistingReversalAndBlocksSuccessors() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let original = UUID()
        let reversal = UUID()
        let event = MoneyEventSummary(
            eventId: original, kind: .openingBalance, occurredOn: "2026-09-28",
            createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1",
            description: "Opening balance", amountCentimes: try Centimes("101"), createdBy: member.userId,
            payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        let source = MoneyDetail(
            version: 1, householdId: member.householdId, event: event, receiptTotalCentimes: nil,
            note: nil, category: nil, reversedById: reversal,
            shares: [
                .init(memberId: member.userId, allocatedCentimes: nil, deltaCentimes: try Centimes("101")),
                .init(memberId: partner, allocatedCentimes: nil, deltaCentimes: try Centimes("-101")),
            ])
        let context = CorrectionContext(
            version: 1, householdId: member.householdId, source: source, hasActiveRefunds: false,
            hasOpeningSuccessor: false, canReverse: false, canReplace: true)
        var draft = try CorrectionDraft(source: source)
        XCTAssertThrowsError(try draft.reviewed(context: context, member: member))
        draft.replace = true
        draft.amount = "0.00"
        let input = try draft.reviewed(context: context, member: member)
        XCTAssertEqual(input.expectedReversalId, reversal)
        guard case .opening(let replacement) = input.replacement else { return XCTFail("Missing opening replacement") }
        XCTAssertEqual(replacement.amountCentimes.value, 0)
        let blocked = CorrectionContext(
            version: 1, householdId: member.householdId, source: source, hasActiveRefunds: false,
            hasOpeningSuccessor: true, canReverse: false, canReplace: false)
        _ = try blocked.validated(member: member, sourceEventId: original)
        XCTAssertThrowsError(try draft.reviewed(context: blocked, member: member))
        draft.payer = UUID()
        XCTAssertThrowsError(try draft.reviewed(context: context, member: member))
    }
}
