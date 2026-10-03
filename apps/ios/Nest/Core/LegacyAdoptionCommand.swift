import Foundation

struct LegacyAdoptionInput: Codable, Equatable, Sendable {
    let ruleId: UUID
    let reviewToken: LegacyReviewToken
    let configuration: RecurringConfiguration
    let firstDueOn: CivilDate

    func validated(member: VerifiedMember) throws -> Self {
        try RecurringInput(ruleId: ruleId, expectedRevision: nil, configuration: configuration, firstDueOn: firstDueOn)
            .validated(member: member)
        return self
    }

    func validated(member: VerifiedMember, balance: MoneyBalance, review: LegacyAdoptionContext, today: CivilDate)
        throws
        -> Self
    {
        _ = try validated(member: member, review: review)
        _ = try balance.validated(member: member)
        let allocationMembers = configuration.allocations.map { Set($0.map(\.memberId)) }
        guard balance.members.contains(where: { $0.id == configuration.payerId }),
            allocationMembers == nil || allocationMembers == Set(balance.members.map(\.id)),
            configuration.startDate.value >= today.value
        else { throw NestAPIFailure.conflict }
        return self
    }

    func validated(member: VerifiedMember, review: LegacyAdoptionContext) throws -> Self {
        _ = try validated(member: member)
        _ = try review.validated(member: member, ruleId: ruleId)
        guard review.canAdopt, review.reviewToken == reviewToken,
            try RecurringDates.firstUncovered(
                schedule: configuration.schedule, from: configuration.startDate,
                coveredThrough: review.coveredThrough) == firstDueOn
        else { throw NestAPIFailure.conflict }
        return self
    }
}

struct SaveLegacyAdoption: Codable, Equatable, Sendable {
    let operationId: UUID
    let input: LegacyAdoptionInput
}

struct LegacyAdoptionReceipt: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let input: LegacyAdoptionInput
    let reviewed: LegacyAdoptionContext
    let revision: UUID
    let status: String

    enum CodingKeys: String, CodingKey {
        case version, actorId, householdId, operationId, approvalId, input, reviewed, revision, status
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
        try values.encode(revision, forKey: .revision)
        try values.encode(status, forKey: .status)
    }

    func validated(
        member: VerifiedMember, command: SaveLegacyAdoption, approvalId expected: UUID? = nil,
        review: LegacyAdoptionContext? = nil
    ) throws -> Self {
        _ = try command.input.validated(member: member, review: reviewed)
        _ = try reviewed.validated(member: member, ruleId: command.input.ruleId)
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == expected, input == command.input,
            reviewed.canAdopt, reviewed.reviewToken == input.reviewToken, status == "active",
            review == nil || reviewed == review
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct LegacyAdoptionRecovery: Codable, Sendable {
    enum Status: String, Codable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: LegacyAdoptionReceipt?

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

    func validated(member: VerifiedMember, command: SaveLegacyAdoption, cancellation: Bool = false) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil),
            !cancellation || status != .unresolved
        else { throw NestAPIFailure.contract }
        if let receipt { _ = try receipt.validated(member: member, command: command) }
        return self
    }
}
