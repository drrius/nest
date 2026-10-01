import Foundation
import XCTest

@testable import NestCore

final class RecurringEntryPreflightTests: XCTestCase {
    func testNewAndEditedRulesRequireExactCurrentCycleAndPeople() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let balance = try self.balance(member: member, partner: partner)
        let configuration = try self.configuration(member: member)
        let ruleId = UUID()
        let revision = UUID()
        let today = try CivilDate("2026-09-28")
        for editing in [false, true] {
            let input = RecurringInput(
                ruleId: ruleId, expectedRevision: editing ? revision : nil,
                configuration: configuration, firstDueOn: today)
            let current = editing ? try rule(member: member, id: ruleId, revision: revision, covered: false) : nil
            try input.validated(member: member, balance: balance, today: today, current: current)
            XCTAssertThrowsError(
                try input.validated(
                    member: member, balance: balance, today: CivilDate("2026-09-29"), current: current))
            if editing {
                XCTAssertThrowsError(
                    try input.validated(member: member, balance: balance, today: today, current: nil))
                let covered = try rule(member: member, id: ruleId, revision: revision, covered: true)
                XCTAssertThrowsError(
                    try input.validated(member: member, balance: balance, today: today, current: covered))
            }
        }
    }

    func testVariableConfirmationRequiresCurrentDueUncoveredCycleAndPeople() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let balance = try self.balance(member: member, partner: partner)
        let current = try rule(member: member, id: UUID(), revision: UUID(), covered: false)
        let input = VariableCycleInput(
            ruleId: current.id, expectedRevision: current.revision, dueOn: try CivilDate("2026-09-28"),
            amountCentimes: try Centimes("101"),
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner))
        let detail = RecurringDetail(
            version: 1, householdId: member.householdId, today: try CivilDate("2026-09-28"), rule: current)
        try input.validated(member: member, balance: balance, detail: detail)
        let future = RecurringDetail(
            version: 1, householdId: member.householdId, today: try CivilDate("2026-09-27"), rule: current)
        XCTAssertThrowsError(try input.validated(member: member, balance: balance, detail: future))
        let covered = RecurringDetail(
            version: 1, householdId: member.householdId, today: try CivilDate("2026-10-28"),
            rule: try rule(member: member, id: current.id, revision: current.revision, covered: true))
        XCTAssertThrowsError(try input.validated(member: member, balance: balance, detail: covered))
        let changedPeople = try self.balance(member: member, partner: UUID())
        XCTAssertThrowsError(try input.validated(member: member, balance: changedPeople, detail: detail))
    }

    private func balance(member: VerifiedMember, partner: UUID) throws -> MoneyBalance {
        .init(
            version: 1, householdId: member.householdId, eventCount: "0", openingEstablished: false,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("0")),
                .init(actorId: partner, displayName: "Sam", centimes: try Centimes("0")),
            ])
    }

    func testExplicitReloadRetainsEditsButUsesFreshRevisionAndCoverage() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let today = try CivilDate("2026-09-28")
        let old = try rule(member: member, id: UUID(), revision: UUID(), covered: false)
        var draft = RecurringDraft(member: member, today: today, existing: old)
        draft.description = "Edited bill"
        draft.note = "Keep this draft"
        draft.categoryId = UUID()
        draft.scheduleKind = .weekly
        draft.scheduleDay = 3
        let current = try rule(member: member, id: old.id, revision: UUID(), covered: true)
        let reloaded = RecurringDraft(member: member, today: today, existing: current).retainingEdits(from: draft)
        XCTAssertEqual(reloaded.ruleId, old.id)
        XCTAssertEqual(reloaded.expectedRevision, current.revision)
        XCTAssertEqual(reloaded.coveredThrough, current.coveredThrough)
        XCTAssertEqual(reloaded.description, draft.description)
        XCTAssertEqual(reloaded.note, draft.note)
        XCTAssertEqual(reloaded.categoryId, draft.categoryId)
        XCTAssertEqual(reloaded.scheduleKind, draft.scheduleKind)
        XCTAssertEqual(reloaded.scheduleDay, draft.scheduleDay)
    }

    private func configuration(member: VerifiedMember) throws -> RecurringConfiguration {
        .init(
            description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-09-01"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28), mode: .variable,
            amountCentimes: nil, allocations: nil)
    }

    private func rule(member: VerifiedMember, id: UUID, revision: UUID, covered: Bool) throws -> RecurringRule {
        .init(
            ruleId: id, revision: revision, configuration: try configuration(member: member), status: .active,
            authorizedBy: member.userId, authorizedAt: "2026-09-28T00:00:00.000000Z",
            coveredThrough: try covered ? CivilDate("2026-10-27") : nil,
            nextDueOn: try CivilDate(covered ? "2026-10-28" : "2026-09-28"))
    }
}
