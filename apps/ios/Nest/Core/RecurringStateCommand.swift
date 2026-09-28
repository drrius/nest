import Foundation

struct RecurringStateInput: Codable, Equatable, Sendable {
    enum Action: String, Codable { case pause, cancel }
    let ruleId: UUID
    let expectedRevision: UUID
    let expectedStatus: RecurringRule.Status
    let action: Action

    func validated() throws {
        guard expectedStatus != .cancelled, action != .pause || expectedStatus == .active else {
            throw NestAPIFailure.invalid
        }
    }
}

struct SaveRecurringState: Codable, Equatable, Sendable {
    let operationId: UUID
    let change: RecurringStateInput
}

struct RecurringStateReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let revision: UUID
    let status: RecurringRule.Status
    let change: RecurringStateInput

    func validated(member: VerifiedMember, command: SaveRecurringState) throws -> Self {
        try change.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, change == command.change,
            revision != change.expectedRevision, status == (change.action == .pause ? .paused : .cancelled)
        else { throw NestAPIFailure.contract }
        return self
    }
}
