import Foundation

struct RecurringDraft {
    let ruleId: UUID
    let expectedRevision: UUID?
    let coveredThrough: CivilDate?
    var description: String
    var mode: RecurringConfiguration.Mode
    var payer: UUID
    var amount: String
    var shares: [UUID: String]
    var note: String
    var categoryId: UUID?
    var startDate: String
    var scheduleKind: RecurringSchedule.Kind
    var scheduleDay: Int

    init(member: VerifiedMember, today: CivilDate, existing: RecurringRule? = nil) {
        ruleId = existing?.id ?? UUID()
        expectedRevision = existing?.revision
        coveredThrough = existing?.coveredThrough
        let config = existing?.configuration
        description = config?.description ?? ""
        mode = config?.mode ?? .variable
        payer = config?.payerId ?? member.userId
        amount = config?.amountCentimes.map(Self.decimal) ?? ""
        shares = Dictionary(
            uniqueKeysWithValues: (config?.allocations ?? []).map { ($0.memberId, Self.decimal($0.centimes)) })
        note = config?.note ?? ""
        categoryId = config?.categoryId
        startDate = config?.startDate.value ?? today.value
        scheduleKind = config?.schedule.kind ?? .monthly
        scheduleDay = Self.day(config?.schedule)
    }

    func reviewed(member: VerifiedMember, members: [UUID], today: CivilDate) throws -> RecurringInput {
        guard members.count == 2, Set(members).count == 2, members.contains(member.userId), members.contains(payer)
        else {
            throw NestAPIFailure.invalid
        }
        let start = try CivilDate(startDate)
        let schedule = RecurringSchedule(
            kind: scheduleKind, weekday: scheduleKind == .weekly ? scheduleDay : nil,
            dayOfMonth: scheduleKind == .monthly ? scheduleDay : nil)
        let allocations: [ExpenseAllocation]? =
            try mode == .fixed
            ? members.map {
                .init(memberId: $0, centimes: try ExpenseSplit.parseCHF(shares[$0] ?? ""))
            } : nil
        let memo = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let config = RecurringConfiguration(
            description: description.trimmingCharacters(in: .whitespacesAndNewlines),
            payerId: payer, categoryId: categoryId, note: memo.isEmpty ? nil : memo, startDate: start,
            schedule: schedule, mode: mode, amountCentimes: try mode == .fixed ? ExpenseSplit.parseCHF(amount) : nil,
            allocations: allocations)
        guard
            let first = try RecurringDates.firstUncovered(
                schedule: schedule,
                from: CivilDate(max(today.value, start.value)), coveredThrough: coveredThrough)
        else {
            throw NestAPIFailure.invalid
        }
        let input = RecurringInput(
            ruleId: ruleId, expectedRevision: expectedRevision, configuration: config, firstDueOn: first)
        try input.validated(member: member)
        return input
    }

    private static func day(_ schedule: RecurringSchedule?) -> Int {
        schedule?.dayOfMonth ?? schedule?.weekday ?? 1
    }

    private static func decimal(_ value: Centimes) -> String {
        "\(value.value / 100).\(String(format: "%02lld", value.value % 100))"
    }
}
