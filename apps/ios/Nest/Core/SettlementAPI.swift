import Foundation

extension MoneyAPI {
    func saveSettlement(token: String, member: VerifiedMember, command: SaveSettlement) async throws
        -> SettlementReceipt
    {
        _ = try command.settlement.validated(member: member)
        let receipt = try await http.write(
            "v1/money/settlement/save", token: token, household: member.householdId, body: command,
            as: SettlementReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverSettlement(token: String, member: VerifiedMember, command: SaveSettlement) async throws
        -> SettlementRecovery
    {
        _ = try command.settlement.validated(member: member)
        let result = try await http.read(
            "v1/money/settlement/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: SettlementRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelSettlement(token: String, member: VerifiedMember, command: SaveSettlement) async throws
        -> SettlementRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.settlement.validated(member: member)
        let result = try await http.write(
            "v1/money/settlement/cancel", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: SettlementRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
