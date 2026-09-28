import Foundation

struct ExpenseDraft {
    enum Split: String, CaseIterable {
        case equal = "Equal"
        case exact = "Exact"
        case percentage = "Percentage"
    }
    var description = ""
    var amount = ""
    var payer: UUID
    var split = Split.equal
    var firstExact = ""
    var secondExact = ""
    var firstPercentage = "50"
    var note = ""
    var categoryId: UUID?
    var separateReceiptTotal = false
    var receiptTotal = ""

    func reviewed(member: VerifiedMember, members: [UUID], date: CivilDate) throws -> ExpenseInput {
        guard members.count == 2, Set(members).count == 2, members.contains(payer), members.contains(member.userId)
        else {
            throw NestAPIFailure.invalid
        }
        let total = try ExpenseSplit.parseCHF(amount)
        let other = members.first(where: { $0 != payer })!
        let allocations: [ExpenseAllocation]
        switch split {
        case .equal:
            allocations = try ExpenseSplit.equal(total, payer: payer, other: other)
        case .exact:
            allocations = try ExpenseSplit.exact(
                total, members: members,
                shares: [
                    .init(memberId: members[0], centimes: try ExpenseSplit.parseCHF(firstExact)),
                    .init(memberId: members[1], centimes: try ExpenseSplit.parseCHF(secondExact)),
                ])
        case .percentage:
            let points = try ExpenseSplit.parseCHF(firstPercentage).value
            guard points <= 10000 else { throw NestAPIFailure.invalid }
            allocations = try ExpenseSplit.percentage(
                total, payer: payer, other: other,
                payerBasisPoints: Int(members[0] == payer ? points : 10000 - points))
        }
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return try ExpenseInput(
            description: description.trimmingCharacters(in: .whitespacesAndNewlines), amountCentimes: total,
            receiptPath: nil, receiptTotalCentimes: separateReceiptTotal ? ExpenseSplit.parseCHF(receiptTotal) : nil,
            payerId: payer, allocations: allocations, date: date, note: trimmedNote.isEmpty ? nil : trimmedNote,
            categoryId: categoryId
        ).validated(member: member)
    }
}
