import Foundation

struct RecurringCycle: Codable, Equatable, Sendable {
    let key: String
    let dueOn: CivilDate
    let startsOn: CivilDate
    let through: CivilDate
}

struct VariableCycleInput: Codable, Equatable, Sendable {
    let ruleId: UUID
    let expectedRevision: UUID
    let dueOn: CivilDate
    let amountCentimes: Centimes
    let allocations: [ExpenseAllocation]

    func validated(member: VerifiedMember) throws {
        guard amountCentimes.value >= 0, allocations.count == 2,
            Set(allocations.map(\.memberId)).count == 2,
            allocations.contains(where: { $0.memberId == member.userId }),
            allocations.allSatisfy({ $0.centimes.value >= 0 }),
            allocations.reduce(Int64(0), { $0 + $1.centimes.value }) == amountCentimes.value
        else { throw NestAPIFailure.invalid }
    }
}

struct SaveVariableCycle: Codable, Equatable, Sendable {
    let operationId: UUID
    let input: VariableCycleInput
}

struct VariableCycleReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let source: String
    let eventId: UUID
    let input: VariableCycleInput
    let cycle: RecurringCycle
    let configuration: RecurringConfiguration
    let expense: ExpenseInput

    func validated(member: VerifiedMember, command: SaveVariableCycle) throws -> Self {
        try input.validated(member: member)
        try configuration.validated(member: member)
        let expected = ExpenseInput(
            description: configuration.description, amountCentimes: input.amountCentimes,
            receiptPath: nil, receiptTotalCentimes: nil, payerId: configuration.payerId,
            allocations: input.allocations, date: input.dueOn, note: configuration.note,
            categoryId: configuration.categoryId)
        _ = try expected.validated(member: member)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, source == "variable", input == command.input,
            configuration.mode == .variable, input.dueOn.value >= configuration.startDate.value,
            cycle == (try RecurringDates.cycle(schedule: configuration.schedule, dueOn: input.dueOn)),
            expense == expected
        else { throw NestAPIFailure.contract }
        return self
    }
}
