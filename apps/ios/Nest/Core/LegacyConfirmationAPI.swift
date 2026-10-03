import Foundation

extension MoneyAPI {
    func saveLegacyConfirmation(token: String, member: VerifiedMember, command: SaveLegacyConfirmation) async throws
        -> LegacyConfirmationReceipt
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-confirmation/save", token: token, household: member.householdId,
            body: command, as: LegacyConfirmationReceipt.self)
        return try result.validated(member: member, command: command)
    }

    func recoverLegacyConfirmation(token: String, member: VerifiedMember, command: SaveLegacyConfirmation) async throws
        -> LegacyConfirmationRecovery
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-confirmation/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyConfirmationRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelLegacyConfirmation(token: String, member: VerifiedMember, command: SaveLegacyConfirmation) async throws
        -> LegacyConfirmationRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        let result = try await http.write(
            "v1/money/recurring/legacy-confirmation/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: LegacyConfirmationRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
