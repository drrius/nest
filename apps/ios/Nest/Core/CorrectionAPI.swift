import Foundation

extension MoneyAPI {
    func saveCorrection(token: String, member: VerifiedMember, command: SaveCorrection) async throws
        -> CorrectionReceipt
    {
        _ = try command.correction.validated(member: member)
        let receipt = try await http.write(
            "v1/money/correction/save", token: token, household: member.householdId, body: command,
            as: CorrectionReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverCorrection(token: String, member: VerifiedMember, command: SaveCorrection) async throws
        -> CorrectionRecovery
    {
        _ = try command.correction.validated(member: member)
        let result = try await http.read(
            "v1/money/correction/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: CorrectionRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelCorrection(token: String, member: VerifiedMember, command: SaveCorrection) async throws
        -> CorrectionRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.correction.validated(member: member)
        let result = try await http.write(
            "v1/money/correction/cancel", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: CorrectionRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
