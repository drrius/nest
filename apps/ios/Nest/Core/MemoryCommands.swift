import Foundation

struct ProposeMemory: Codable, Equatable, Sendable {
    let operationId: UUID
    let memoryId: UUID
    let expectedRevision: String
    let content: String

    var change: MemoryChange {
        MemoryChange(memoryId: memoryId, expectedRevision: expectedRevision, content: content)
    }
}

struct DecideMemory: Codable, Equatable, Sendable {
    let operationId: UUID
    let approvalId: UUID
    let memoryId: UUID
    let expectedRevision: String
    let content: String
    let approved: Bool

    init(approval: MemoryApproval, approved: Bool) {
        operationId = approval.operationId
        approvalId = approval.id
        memoryId = approval.change.memoryId
        expectedRevision = approval.change.expectedRevision
        content = approval.change.content
        self.approved = approved
    }
}

struct RemoveMemory: Codable, Equatable, Sendable {
    let operationId: UUID
    let memoryId: UUID
    let expectedRevision: String
}

struct MemoryReceipt: Codable, Equatable, Sendable {
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let memoryId: UUID
    let revision: String
    let removed: Bool

    func validated(
        member: VerifiedMember, operation: UUID, memory: UUID, expected: String, removed: Bool
    ) throws -> Self {
        guard MealRevision.valid(expected), let previous = Int64(expected), previous < Int64.max,
            actorId == member.userId, householdId == member.householdId,
            operationId == operation, memoryId == memory, revision == String(previous + 1), self.removed == removed
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct MemoryDecisionEnvelope: Codable, Sendable {
    struct Decision: Codable, Sendable {
        let status: String
        let receipt: MemoryReceipt?
    }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let decision: Decision

    func validated(member: VerifiedMember, command: DecideMemory) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw NestAPIFailure.contract
        }
        if command.approved {
            guard decision.status == "consumed", let receipt = decision.receipt else { throw NestAPIFailure.contract }
            _ = try receipt.validated(
                member: member, operation: command.operationId, memory: command.memoryId,
                expected: command.expectedRevision, removed: false)
        } else {
            guard decision.status == "denied", decision.receipt == nil else { throw NestAPIFailure.contract }
        }
        return self
    }
}

struct MemoryRemovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let receipt: MemoryReceipt

    func validated(member: VerifiedMember, command: RemoveMemory) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw NestAPIFailure.contract
        }
        _ = try receipt.validated(
            member: member, operation: command.operationId, memory: command.memoryId,
            expected: command.expectedRevision, removed: true)
        return self
    }
}
