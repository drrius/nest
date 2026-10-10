import Foundation

extension MoneyAPI {
    func saveLegacyDismissal(token: String, member: VerifiedMember, command: SaveLegacyDismissal) async throws
        -> LegacyDismissalReceipt
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-dismissal/save", token: token, household: member.householdId,
            body: command, as: LegacyDismissalReceipt.self)
        return try result.validated(member: member, command: command)
    }

    func recoverLegacyDismissal(token: String, member: VerifiedMember, command: SaveLegacyDismissal) async throws
        -> LegacyDismissalRecovery
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-dismissal/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyDismissalRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelLegacyDismissal(token: String, member: VerifiedMember, command: SaveLegacyDismissal) async throws
        -> LegacyDismissalRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        let result = try await http.write(
            "v1/money/recurring/legacy-dismissal/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: LegacyDismissalRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
