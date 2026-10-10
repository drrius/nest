import Foundation

extension RecurringInput {
    func validated(member: VerifiedMember, balance: MoneyBalance, today: CivilDate, current: RecurringRule?) throws {
        try validated(member: member)
        _ = try balance.validated(member: member)
        let allocationMembers = configuration.allocations.map { Set($0.map(\.memberId)) }
        guard balance.members.contains(where: { $0.id == configuration.payerId }),
            allocationMembers == nil || allocationMembers == Set(balance.members.map(\.id)),
            current?.id == (expectedRevision == nil ? nil : ruleId), current?.revision == expectedRevision,
            current?.status != .cancelled,
            try RecurringDates.firstUncovered(
                schedule: configuration.schedule,
                from: CivilDate(max(today.value, configuration.startDate.value)),
                coveredThrough: current?.coveredThrough) == firstDueOn
        else { throw NestAPIFailure.conflict }
    }
}

extension VariableCycleInput {
    func validated(member: VerifiedMember, balance: MoneyBalance, detail: RecurringDetail) throws {
        try validated(member: member)
        _ = try balance.validated(member: member)
        _ = try detail.validated(member: member, ruleId: ruleId)
        guard detail.rule.revision == expectedRevision, detail.rule.isDue(on: detail.today),
            detail.rule.nextDueOn == dueOn,
            try RecurringDates.firstUncovered(
                schedule: detail.rule.configuration.schedule, from: dueOn,
                coveredThrough: detail.rule.coveredThrough) == dueOn,
            Set(allocations.map(\.memberId)) == Set(balance.members.map(\.id)),
            balance.members.contains(where: { $0.id == detail.rule.configuration.payerId })
        else { throw NestAPIFailure.conflict }
    }
}
