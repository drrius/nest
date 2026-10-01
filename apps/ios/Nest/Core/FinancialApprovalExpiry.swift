import Foundation

struct FinancialApprovalExpiry: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approvalId: UUID
    let operationId: UUID
    let command: PendingFinancialApproval.Command
    let expiredUnused: Bool
    let checkedAt: String

    func validated(
        member: VerifiedMember, approvalId: UUID, operationId: UUID,
        command: PendingFinancialApproval.Command
    ) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            self.approvalId == approvalId, self.operationId == operationId, self.command == command,
            [
                .expense, .refund, .correction, .settlement, .createRule, .updateRule, .pauseRule, .cancelRule,
                .resumeRule,
            ].contains(command),
            ApprovalTime.date(checkedAt) != nil
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func approvalExpiry(
        token: String, member: VerifiedMember, approvalId: UUID, operationId: UUID,
        command: PendingFinancialApproval.Command
    ) async throws -> FinancialApprovalExpiry {
        let query =
            "approvalId=\(approvalId.uuidString.lowercased())&operationId=\(operationId.uuidString.lowercased())&command=\(command.rawValue)"
        let result = try await http.read(
            "v1/money/approval-expiry?\(query)", token: token, household: member.householdId,
            as: FinancialApprovalExpiry.self)
        return try result.validated(
            member: member, approvalId: approvalId, operationId: operationId, command: command)
    }
}
