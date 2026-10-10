import Foundation

struct ExpenseAllocation: Codable, Equatable, Sendable {
    let memberId: UUID
    let centimes: Centimes
}

enum ExpenseSplit {
    static func parseCHF(_ input: String) throws -> Centimes {
        let text = input.trimmingCharacters(in: .whitespacesAndNewlines).replacingOccurrences(of: ",", with: ".")
        guard text.range(of: #"\A[0-9]{1,14}(?:\.[0-9]{1,2})?\z"#, options: .regularExpression) != nil else {
            throw NestAPIFailure.invalid
        }
        let parts = text.split(separator: ".")
        guard let whole = Int64(parts[0]) else { throw NestAPIFailure.invalid }
        let fraction = parts.count == 2 ? String(parts[1]) : ""
        let cents = Int64(fraction.padding(toLength: 2, withPad: "0", startingAt: 0))!
        return try Centimes(String(whole * 100 + cents))
    }

    static func equal(_ amount: Centimes, payer: UUID, other: UUID) throws -> [ExpenseAllocation] {
        try percentage(amount, payer: payer, other: other, payerBasisPoints: 5000)
    }

    /// Largest remainder; a half-cent tie belongs to the payer. No intermediate multiplication overflows.
    static func percentage(_ amount: Centimes, payer: UUID, other: UUID, payerBasisPoints: Int) throws
        -> [ExpenseAllocation]
    {
        guard amount.value >= 0, payer != other, (0...10000).contains(payerBasisPoints) else {
            throw NestAPIFailure.invalid
        }
        let otherPoints = Int64(10000 - payerBasisPoints)
        let remainder = (amount.value % 10000) * otherPoints
        let otherShare = (amount.value / 10000) * otherPoints + remainder / 10000 + (remainder % 10000 > 5000 ? 1 : 0)
        return [
            .init(memberId: payer, centimes: try Centimes(String(amount.value - otherShare))),
            .init(memberId: other, centimes: try Centimes(String(otherShare))),
        ]
    }

    static func exact(_ amount: Centimes, members: [UUID], shares: [ExpenseAllocation]) throws -> [ExpenseAllocation] {
        guard amount.value >= 0, members.count == 2, Set(members).count == 2,
            shares.count == 2, Set(shares.map(\.memberId)) == Set(members),
            shares.allSatisfy({ $0.centimes.value >= 0 }),
            shares.reduce(Int64(0), { $0 + $1.centimes.value }) == amount.value
        else { throw NestAPIFailure.invalid }
        return try members.map { member in
            guard let share = shares.first(where: { $0.memberId == member }) else { throw NestAPIFailure.invalid }
            return share
        }
    }
}
