import Foundation

struct LegacyDismissInput: Codable, Equatable, Sendable {
    let draftId: UUID
    let ruleId: UUID
    let reviewToken: LegacyReviewToken
}

struct SaveLegacyDismissal: Codable, Equatable, Sendable {
    let operationId: UUID
    let input: LegacyDismissInput
}

struct LegacyDismissalReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let input: LegacyDismissInput
    let reviewed: LegacyDraftContext
    let status: String

    enum CodingKeys: String, CodingKey {
        case version, actorId, householdId, operationId, approvalId, input, reviewed, status
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(actorId, forKey: .actorId)
        try values.encode(householdId, forKey: .householdId)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(approvalId, forKey: .approvalId)
        try values.encode(input, forKey: .input)
        try values.encode(reviewed, forKey: .reviewed)
        try values.encode(status, forKey: .status)
    }

    func validated(
        member: VerifiedMember, command: SaveLegacyDismissal, approvalId expected: UUID? = nil,
        review: LegacyDraftContext? = nil
    ) throws -> Self {
        _ = try reviewed.validated(member: member, draftId: command.input.draftId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == expected, input == command.input,
            reviewed.dismissalInput == input, reviewed.canDismiss, status == "dismissed",
            review == nil || reviewed == review
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct LegacyDismissalRecovery: Codable, Sendable {
    enum Status: String, Codable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: LegacyDismissalReceipt?

    enum CodingKeys: String, CodingKey { case version, actorId, householdId, operationId, status, receipt }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(actorId, forKey: .actorId)
        try values.encode(householdId, forKey: .householdId)
        try values.encode(operationId, forKey: .operationId)
        try values.encode(status, forKey: .status)
        try values.encode(receipt, forKey: .receipt)
    }

    func validated(member: VerifiedMember, command: SaveLegacyDismissal, cancellation: Bool = false) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil),
            !cancellation || status != .unresolved
        else { throw NestAPIFailure.contract }
        if let receipt { _ = try receipt.validated(member: member, command: command) }
        return self
    }
}
