import Foundation

struct VariableCycleRecovery: Codable, Sendable {
    enum Status: String, Codable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: VariableCycleReceipt?

    func validated(member: VerifiedMember, command: SaveVariableCycle, cancellation: Bool = false) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil),
            !cancellation || status != .unresolved
        else { throw NestAPIFailure.contract }
        if let receipt { _ = try receipt.validated(member: member, command: command) }
        return self
    }
}
