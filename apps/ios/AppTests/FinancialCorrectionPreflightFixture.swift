import Foundation

@testable import Nest

enum FinancialCorrectionPreflightFixture {
    static func source(member: VerifiedMember, partner: UUID, event: UUID) throws -> MoneyDetail {
        let summary = MoneyEventSummary(
            eventId: event, kind: .expense, occurredOn: "2026-09-28",
            createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1",
            description: "Fixture", amountCentimes: try Centimes("101"), createdBy: member.userId,
            payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        return MoneyDetail(
            version: 1, householdId: member.householdId, event: summary,
            receiptTotalCentimes: nil, note: nil, category: nil, reversedById: nil,
            shares: [
                .init(
                    memberId: member.userId, allocatedCentimes: try Centimes("51"),
                    deltaCentimes: try Centimes("50")),
                .init(memberId: partner, allocatedCentimes: try Centimes("50"), deltaCentimes: try Centimes("-50")),
            ])
    }

    static func refund(source: MoneyDetail, member: VerifiedMember, partner: UUID, fault: String?) throws
        -> RefundContext
    {
        .init(
            version: 1, householdId: fault == "household" ? UUID() : member.householdId, source: source,
            remaining: [
                .init(memberId: member.userId, centimes: try Centimes(fault == "changed" ? "49" : "51")),
                .init(memberId: partner, centimes: try Centimes("50")),
            ], refundable: true)
    }

    static func correction(source: MoneyDetail, member: VerifiedMember, partner: UUID, fault: String?) throws
        -> CorrectionContext
    {
        .init(
            version: 1, householdId: fault == "household" ? UUID() : member.householdId, source: source,
            hasActiveRefunds: fault == "changed", hasOpeningSuccessor: false,
            canReverse: fault != "changed", canReplace: fault != "changed")
    }
}
