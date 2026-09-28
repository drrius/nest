import Foundation

extension MoneyAPI {
    func saveRefund(token: String, member: VerifiedMember, command: SaveRefund) async throws
        -> RefundReceipt
    {
        _ = try command.refund.validated(member: member)
        let receipt = try await http.write(
            "v1/money/refund/save", token: token, household: member.householdId, body: command,
            as: RefundReceipt.self
        )
        return try receipt.validated(member: member, command: command)
    }

    func recoverRefund(token: String, member: VerifiedMember, command: SaveRefund) async throws
        -> RefundRecovery
    {
        _ = try command.refund.validated(member: member)
        let result = try await http.read(
            "v1/money/refund/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RefundRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelRefund(token: String, member: VerifiedMember, command: SaveRefund) async throws
        -> RefundRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        _ = try command.refund.validated(member: member)
        let result = try await http.write(
            "v1/money/refund/cancel", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: RefundRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
