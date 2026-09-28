import Foundation

struct VariableCycleDraft {
    var amount = ""
    var shares: [UUID: String] = [:]

    func reviewed(detail: RecurringDetail, member: VerifiedMember, members: [UUID]) throws -> VariableCycleInput {
        let rule = detail.rule
        guard detail.householdId == member.householdId, rule.isDue(on: detail.today),
            let due = rule.nextDueOn, members.count == 2, Set(members).count == 2,
            members.contains(member.userId), members.contains(rule.configuration.payerId)
        else { throw NestAPIFailure.invalid }
        let input = VariableCycleInput(
            ruleId: rule.id, expectedRevision: rule.revision, dueOn: due,
            amountCentimes: try ExpenseSplit.parseCHF(amount),
            allocations: try members.map {
                .init(memberId: $0, centimes: try ExpenseSplit.parseCHF(shares[$0] ?? ""))
            })
        try input.validated(member: member)
        return input
    }
}
