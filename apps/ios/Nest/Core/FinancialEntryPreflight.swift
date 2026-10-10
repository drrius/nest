import Foundation

extension ExpenseInput {
    func validated(member: VerifiedMember, balance: MoneyBalance) throws -> Self {
        _ = try validated(member: member)
        _ = try balance.validated(member: member)
        guard Set(allocations.map(\.memberId)) == Set(balance.members.map(\.id)) else {
            throw NestAPIFailure.conflict
        }
        return self
    }
}

extension SettlementInput {
    func validated(member: VerifiedMember, balance: MoneyBalance) throws -> Self {
        _ = try validated(member: member)
        _ = try balance.validated(member: member)
        guard Set([payerId, recipientId]) == Set(balance.members.map(\.id)),
            let payer = balance.members.first(where: { $0.id == payerId }),
            payer.centimes.value < 0, -payer.centimes.value == expectedOutstandingCentimes.value
        else { throw NestAPIFailure.conflict }
        return self
    }
}
