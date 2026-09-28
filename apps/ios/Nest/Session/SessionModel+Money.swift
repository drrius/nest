import Foundation

extension SessionModel {
    func readMoneyBalance(member: VerifiedMember, generation expected: Int) async throws -> MoneyBalance {
        try requireMoneyAccount(member, generation: expected)
        guard let auth, let moneyAPI else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireMoneyAccount(member, generation: expected)
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let result = try await moneyAPI.balance(token: session.accessToken, member: member)
        try requireMoneyAccount(member, generation: expected)
        return result
    }

    func readMoneyHistory(member: VerifiedMember, generation expected: Int, before: UUID?) async throws -> MoneyHistory
    {
        try requireMoneyAccount(member, generation: expected)
        guard let auth, let moneyAPI else { throw NestAPIFailure.configuration }
        let session = try await auth.session()
        try requireMoneyAccount(member, generation: expected)
        guard session.userId == member.userId else { throw NestAPIFailure.signedOut }
        let result = try await moneyAPI.history(token: session.accessToken, member: member, before: before)
        try requireMoneyAccount(member, generation: expected)
        return result
    }

    private func requireMoneyAccount(_ member: VerifiedMember, generation expected: Int) throws {
        guard generation == expected, status == .ready(member) else { throw NestAPIFailure.signedOut }
    }
}
