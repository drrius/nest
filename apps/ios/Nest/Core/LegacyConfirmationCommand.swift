import Foundation

struct LegacyConfirmInput: Codable, Equatable, Sendable {
    let draftId: UUID
    let ruleId: UUID
    let reviewToken: LegacyReviewToken
    let expense: ExpenseInput

    var retainedInput: LegacyDismissInput {
        .init(draftId: draftId, ruleId: ruleId, reviewToken: reviewToken)
    }

    func validated(member: VerifiedMember) throws -> Self {
        guard expense.receiptPath == nil, expense.receiptTotalCentimes == nil else {
            throw NestAPIFailure.invalid
        }
        _ = try expense.validated(member: member)
        return self
    }
}

struct SaveLegacyConfirmation: Codable, Equatable, Sendable {
    let operationId: UUID
    let input: LegacyConfirmInput
}

struct LegacyConfirmationReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let input: LegacyConfirmInput
    let reviewed: LegacyDraftContext
    let eventId: UUID
    let status: String

    enum CodingKeys: String, CodingKey {
        case version, actorId, householdId, operationId, approvalId, input, reviewed, eventId, status
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
        try values.encode(eventId, forKey: .eventId)
        try values.encode(status, forKey: .status)
    }

    func validated(
        member: VerifiedMember, command: SaveLegacyConfirmation, approvalId expected: UUID? = nil,
        review: LegacyDraftContext? = nil
    ) throws -> Self {
        _ = try command.input.validated(member: member)
        _ = try reviewed.validated(member: member, draftId: command.input.draftId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == expected, input == command.input,
            reviewed.dismissalInput == input.retainedInput, reviewed.canDismiss, status == "posted",
            review == nil || reviewed == review
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct LegacyConfirmationRecovery: Codable, Sendable {
    enum Status: String, Codable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: LegacyConfirmationReceipt?

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

    func validated(member: VerifiedMember, command: SaveLegacyConfirmation, cancellation: Bool = false) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil),
            !cancellation || status != .unresolved
        else { throw NestAPIFailure.contract }
        if let receipt { _ = try receipt.validated(member: member, command: command) }
        return self
    }
}
