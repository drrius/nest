import Foundation

struct CorrectionDraft {
    var replace = false
    var description: String
    var amount: String
    var payer: UUID
    var shares: [UUID: String]
    var date: String
    var note: String

    init(source: MoneyDetail) throws {
        guard let payer = source.event.payerId else { throw NestAPIFailure.invalid }
        self.payer = payer
        description = source.event.description
        amount = Self.decimal(source.event.amountCentimes)
        shares = Dictionary(
            uniqueKeysWithValues: source.shares.map {
                ($0.memberId, $0.allocatedCentimes.map(Self.decimal) ?? "0.00")
            })
        date = source.event.occurredOn
        note = source.note ?? ""
    }

    func reviewed(context: CorrectionContext, member: VerifiedMember) throws -> CorrectionInput {
        _ = try context.validated(member: member, sourceEventId: context.source.event.id)
        guard replace ? context.canReplace : context.canReverse else { throw NestAPIFailure.invalid }
        let source = context.source
        var replacement: CorrectionReplacement?
        if replace {
            guard source.shares.contains(where: { $0.memberId == payer }) else { throw NestAPIFailure.invalid }
            let total = try ExpenseSplit.parseCHF(amount)
            let text = description.trimmingCharacters(in: .whitespacesAndNewlines)
            let memo = note.trimmingCharacters(in: .whitespacesAndNewlines)
            if source.event.kind == .openingBalance {
                replacement = .opening(
                    .init(
                        description: text, amountCentimes: total, payerId: payer,
                        date: try CivilDate(date), note: memo.isEmpty ? nil : memo))
            } else {
                let allocations = try source.shares.map {
                    ExpenseAllocation(
                        memberId: $0.memberId, centimes: try ExpenseSplit.parseCHF(shares[$0.memberId] ?? ""))
                }
                replacement = .expense(
                    .init(
                        description: text, amountCentimes: total, receiptPath: nil, receiptTotalCentimes: nil,
                        payerId: payer, allocations: allocations, date: try CivilDate(date),
                        note: memo.isEmpty ? nil : memo, categoryId: source.category?.id))
            }
        }
        return try CorrectionInput(
            sourceEventId: source.event.id,
            expectedReversalId: replace && source.event.kind == .openingBalance ? source.reversedById : nil,
            replacement: replacement
        ).validated(member: member)
    }

    private static func decimal(_ value: Centimes) -> String {
        "\(value.value / 100).\(String(format: "%02lld", value.value % 100))"
    }
}
