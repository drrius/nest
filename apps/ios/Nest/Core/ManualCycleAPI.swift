import Foundation

extension MoneyAPI {
    func saveManualCycle(token: String, member: VerifiedMember, command: SaveManualCycle) async throws
        -> ManualCycleReceipt
    {
        let receipt = try await http.write(
            "v1/money/recurring/manual/save", token: token, household: member.householdId, body: command,
            as: ManualCycleReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverManualCycle(token: String, member: VerifiedMember, command: SaveManualCycle) async throws
        -> ManualCycleRecovery
    {
        let result = try await http.read(
            "v1/money/recurring/manual/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: ManualCycleRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelManualCycle(token: String, member: VerifiedMember, command: SaveManualCycle) async throws
        -> ManualCycleRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        let result = try await http.write(
            "v1/money/recurring/manual/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: ManualCycleRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
