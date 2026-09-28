import Foundation

struct PendingFinancialApproval: Codable, Identifiable, Sendable {
    enum Command: String, Codable, Sendable {
        case expense = "expenses.record"
        case correction = "expenses.correct"
        case refund = "expenses.refund"
        case settlement = "settlements.record"
        case createRule = "recurring.create"
        case updateRule = "recurring.update"
        case pauseRule = "recurring.pause"
        case cancelRule = "recurring.cancel"
        case resumeRule = "recurring.resume"
        case recordCycle = "recurring.record-cycle"
        case linkCycle = "recurring.link-cycle"
        case dismissLegacy = "recurring.dismiss-legacy-draft"
        case confirmLegacy = "recurring.confirm-legacy-draft"
        case adoptLegacy = "recurring.adopt-legacy"
    }
    let approvalId: UUID
    let command: Command
    let expiresAt: String
    var id: UUID { approvalId }
}

struct PendingFinancialApprovals: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let actorId: UUID
    let approvals: [PendingFinancialApproval]
    let next: UUID?

    func validated(member: VerifiedMember, after: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, actorId == member.userId,
            approvals.count <= 20,
            next == nil || (approvals.count == 20 && next == approvals.last?.id)
        else { throw NestAPIFailure.contract }
        var previous = after?.uuidString.lowercased() ?? ""
        for approval in approvals {
            let identity = approval.id.uuidString.lowercased()
            guard identity > previous, MoneyTime.timestamp(approval.expiresAt) else {
                throw NestAPIFailure.contract
            }
            previous = identity
        }
        return self
    }
}

extension MoneyAPI {
    func pendingApprovals(token: String, member: VerifiedMember, after: UUID?) async throws
        -> PendingFinancialApprovals
    {
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/money/pending-approvals\(query)", token: token,
            household: member.householdId, as: PendingFinancialApprovals.self)
        return try result.validated(member: member, after: after)
    }
}
