import Foundation

struct PushDeviceState: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let installationId: UUID
    let revision: UUID?
    let enabled: Bool
    let provider: String?
    let environment: PushEnvironment?

    func validated(member: VerifiedMember, installation: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            installationId == installation, !enabled || revision != nil,
            (provider == nil && environment == nil) || (provider == "apns" && environment != nil)
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct PushDeviceReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let installationId: UUID
    let expectedRevision: UUID?
    let revision: UUID
    let action: PushDeviceCommand.Action
    let commandDigest: String

    func validated(member: VerifiedMember, command: PushDeviceCommand) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, installationId == command.installationId,
            expectedRevision == command.expectedRevision, revision != expectedRevision,
            action == command.action, commandDigest == (try command.digest(member: member))
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct PushDeviceRecovery: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: PushDeviceReceipt?

    func validated(member: VerifiedMember, command: PushDeviceCommand) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil)
        else { throw NestAPIFailure.contract }
        _ = try receipt?.validated(member: member, command: command)
        return self
    }
}
