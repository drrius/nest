import Foundation
import XCTest

@testable import NestCore

final class VariableCycleTests: XCTestCase {
    func testReceiptBindsReviewedExpenseCycleAndAccount() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let date = try CivilDate("2026-09-28")
        let allocations = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: UUID())
        let input = VariableCycleInput(
            ruleId: UUID(), expectedRevision: UUID(), dueOn: date,
            amountCentimes: try Centimes("101"), allocations: allocations)
        let command = SaveVariableCycle(operationId: UUID(), input: input)
        let config = RecurringConfiguration(
            description: "Bill", payerId: member.userId, categoryId: nil,
            note: nil, startDate: date, schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let expense = ExpenseInput(
            description: "Bill", amountCentimes: input.amountCentimes,
            receiptPath: nil, receiptTotalCentimes: nil, payerId: member.userId, allocations: allocations,
            date: date, note: nil, categoryId: nil)
        let cycle = try RecurringDates.cycle(schedule: config.schedule, dueOn: date)
        func receipt(_ period: RecurringCycle) -> VariableCycleReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, source: "variable", eventId: UUID(),
                input: input, cycle: period, configuration: config, expense: expense)
        }
        _ = try receipt(cycle).validated(member: member, command: command)
        let wrong = RecurringCycle(
            key: "monthly:2026-08-01", dueOn: date, startsOn: cycle.startsOn, through: cycle.through)
        XCTAssertThrowsError(try receipt(wrong).validated(member: member, command: command))
        let other = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try receipt(cycle).validated(member: other, command: command))
        let changed = VariableCycleInput(
            ruleId: input.ruleId, expectedRevision: input.expectedRevision,
            dueOn: date, amountCentimes: try Centimes("102"), allocations: allocations)
        XCTAssertThrowsError(try changed.validated(member: member))
        XCTAssertThrowsError(
            try receipt(cycle).validated(
                member: member, command: .init(operationId: command.operationId, input: changed)))
    }
}
