import Foundation

struct ManualCycleInput: Codable, Equatable, Sendable {
    let ruleId: UUID
    let expectedRevision: UUID
    let dueOn: CivilDate
    let sourceEventId: UUID

    func validated(member: VerifiedMember, balance: MoneyBalance, target: RecurringDetail, source: MoneyDetail) throws {
        _ = try balance.validated(member: member)
        _ = try target.validated(member: member, ruleId: ruleId)
        _ = try source.validated(member: member, eventId: sourceEventId)
        let currentMembers = Set(balance.members.map(\.id))
        guard target.rule.revision == expectedRevision, target.manualCycle?.dueOn == dueOn,
            eligible(source: source, cycle: target.manualCycle),
            Set(source.shares.map(\.id)) == currentMembers,
            currentMembers.contains(target.rule.configuration.payerId),
            target.rule.configuration.allocations.map({ Set($0.map(\.memberId)) == currentMembers }) != false
        else { throw NestAPIFailure.conflict }
    }

    func eligible(source: MoneyDetail, cycle: RecurringCycle?) -> Bool {
        guard let cycle else { return false }
        return source.event.id == sourceEventId && [.expense, .replacement].contains(source.event.kind)
            && source.reversedById == nil && source.event.occurredOn >= cycle.startsOn.value
            && source.event.occurredOn <= cycle.through.value
    }
}

struct SaveManualCycle: Codable, Equatable, Sendable {
    let operationId: UUID
    let input: ManualCycleInput
}

struct ManualCycleReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let source: String
    let eventId: UUID
    let input: ManualCycleInput
    let cycle: RecurringCycle
    let configuration: RecurringConfiguration
    let linkedExpense: MoneyDetail

    func validated(member: VerifiedMember, command: SaveManualCycle, approvalId expectedApprovalId: UUID? = nil)
        throws -> Self
    {
        try configuration.validated(member: member)
        _ = try linkedExpense.validated(member: member, eventId: input.sourceEventId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == expectedApprovalId, source == "manual",
            input == command.input, eventId == input.sourceEventId, cycle.dueOn == input.dueOn,
            input.dueOn.value >= configuration.startDate.value,
            cycle == (try RecurringDates.cycle(schedule: configuration.schedule, dueOn: input.dueOn)),
            input.eligible(source: linkedExpense, cycle: cycle)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension RecurringDetail {
    var manualCycle: RecurringCycle? {
        guard rule.status == .active, let due = rule.nextDueOn, due.value <= today.value,
            due.value >= rule.configuration.startDate.value,
            (try? RecurringDates.firstUncovered(
                schedule: rule.configuration.schedule, from: due, coveredThrough: rule.coveredThrough)) == due
        else { return nil }
        return try? RecurringDates.cycle(schedule: rule.configuration.schedule, dueOn: due)
    }
}
