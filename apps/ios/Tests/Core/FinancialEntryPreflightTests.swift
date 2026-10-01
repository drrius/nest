import Foundation
import XCTest

@testable import NestCore

final class FinancialEntryPreflightTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let partner = UUID()

    private func balance(_ debt: Int64, reversed: Bool = false) throws -> MoneyBalance {
        .init(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: true,
            members: [
                .init(
                    actorId: member.userId, displayName: "Alex",
                    centimes: try Centimes(String(reversed ? debt : -debt))),
                .init(
                    actorId: partner, displayName: "Sam", centimes: try Centimes(String(reversed ? -debt : debt))),
            ])
    }

    private func settlement(_ debt: Int64, amount: Int64, reversed: Bool, full: Bool) throws -> SettlementInput {
        .init(
            description: "Synthetic settlement", amountCentimes: try Centimes(String(amount)),
            expectedOutstandingCentimes: try Centimes(String(debt)), payerId: reversed ? partner : member.userId,
            recipientId: reversed ? member.userId : partner, mode: full ? .full : .partial,
            date: try CivilDate("2026-10-01"), note: nil)
    }

    func testGeneratedFullAndPartialReviewsBindExactLiveDebtAndDirectionAtCentimeBounds() throws {
        let bounds: [Int64] = [1, 2, 99, 100, 101, 9999, 9_007_199_254_740_990]
        for debt in bounds + (1...128).map({ Int64($0 * 37) }) {
            for reversed in [false, true] {
                for full in [false, true] {
                    let amount = full ? debt : max(1, debt / 2)
                    let input = try settlement(debt, amount: amount, reversed: reversed, full: full)
                    XCTAssertEqual(
                        try input.validated(member: member, balance: balance(debt, reversed: reversed)), input)
                    for changed in [Int64(0), debt - 1, debt + 1] {
                        XCTAssertThrowsError(
                            try input.validated(member: member, balance: balance(changed, reversed: reversed)))
                    }
                    XCTAssertThrowsError(
                        try input.validated(member: member, balance: balance(debt, reversed: !reversed)))
                }
            }
        }
    }

    func testFreshHouseholdMembershipRejectsForeignExpenseSharesAndSettlementRecipient() throws {
        let outsider = UUID()
        let input = ExpenseInput(
            description: "Synthetic expense", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: outsider),
            date: try CivilDate("2026-10-01"), note: nil, categoryId: nil)
        _ = try input.validated(member: member)
        XCTAssertThrowsError(try input.validated(member: member, balance: balance(101)))
        let wrong = SettlementInput(
            description: "Synthetic settlement", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId, recipientId: outsider,
            mode: .full, date: try CivilDate("2026-10-01"), note: nil)
        _ = try wrong.validated(member: member)
        XCTAssertThrowsError(try wrong.validated(member: member, balance: balance(101)))
        let shared = ExpenseInput(
            description: input.description, amountCentimes: input.amountCentimes, receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: input.date, note: nil, categoryId: nil)
        XCTAssertEqual(try shared.validated(member: member, balance: balance(0)), shared)
    }
}
