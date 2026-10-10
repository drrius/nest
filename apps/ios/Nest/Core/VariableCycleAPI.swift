import Foundation

extension MoneyAPI {
    func saveVariableCycle(token: String, member: VerifiedMember, command: SaveVariableCycle) async throws
        -> VariableCycleReceipt
    {
        _ = try command.input.validated(member: member)
        let receipt = try await http.write(
            "v1/money/recurring/variable/save", token: token, household: member.householdId, body: command,
            as: VariableCycleReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverVariableCycle(token: String, member: VerifiedMember, command: SaveVariableCycle) async throws
        -> VariableCycleRecovery
    {
        _ = try command.input.validated(member: member)
        let result = try await http.read(
            "v1/money/recurring/variable/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: VariableCycleRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelVariableCycle(token: String, member: VerifiedMember, command: SaveVariableCycle) async throws
        -> VariableCycleRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.input.validated(member: member)
        let result = try await http.write(
            "v1/money/recurring/variable/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: VariableCycleRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
