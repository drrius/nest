import Foundation

struct LegacyRecurringRule: Codable, Equatable, Identifiable, Sendable {
    let ruleId: UUID
    let mode: String
    let description: String
    let amountCentimes: Centimes
    let payerId: UUID
    let allocations: LegacyRecurringSplit
    let categoryId: UUID?
    let active: Bool
    let nextOccurrenceOn: LegacyTemporalValue
    let updatedAt: LegacyTemporalValue
    let schedule: RecurringSchedule
    let drafts: LegacyDraftCounts
    var id: UUID { ruleId }

    enum CodingKeys: String, CodingKey {
        case ruleId, mode, description, amountCentimes, payerId, allocations, categoryId, active,
            nextOccurrenceOn, updatedAt, schedule, drafts
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(ruleId, forKey: .ruleId)
        try values.encode(mode, forKey: .mode)
        try values.encode(description, forKey: .description)
        try values.encode(amountCentimes, forKey: .amountCentimes)
        try values.encode(payerId, forKey: .payerId)
        try values.encode(allocations, forKey: .allocations)
        try values.encode(categoryId, forKey: .categoryId)
        try values.encode(active, forKey: .active)
        try values.encode(nextOccurrenceOn, forKey: .nextOccurrenceOn)
        try values.encode(updatedAt, forKey: .updatedAt)
        try values.encode(schedule, forKey: .schedule)
        try values.encode(drafts, forKey: .drafts)
    }

    var needsReview: Bool {
        allocations.kind == .needsReview || nextOccurrenceOn.kind == .unsupported
            || updatedAt.kind == .unsupported || drafts.needsReconciliation
    }

    var valid: Bool {
        mode == "legacy_draft_only" && LegacyRecurringLabel.valid(description) && amountCentimes.value >= 0
            && allocations.valid(amount: amountCentimes, payer: payerId) && schedule.valid && drafts.valid
            && nextOccurrenceOn.valid(expected: .date) && updatedAt.valid(expected: .timestamp)
    }
}

struct LegacyRecurringList: Decodable, Sendable {
    let version: Int
    let householdId: UUID
    let after: UUID?
    let next: UUID?
    let rules: [LegacyRecurringRule]

    func validated(member: VerifiedMember, after cursor: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, after == cursor, rules.count <= 20,
            rules.allSatisfy(\.valid), next == nil || (rules.count == 20 && next == rules.last?.id)
        else { throw NestAPIFailure.contract }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for row in rules {
            let id = row.id.uuidString.lowercased()
            guard id > previous else { throw NestAPIFailure.contract }
            previous = id
        }
        return self
    }
}

extension MoneyAPI {
    func legacyRecurring(token: String, member: VerifiedMember, after: UUID?) async throws -> LegacyRecurringList {
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let page = try await http.read(
            "v1/money/recurring/legacy\(query)", token: token, household: member.householdId,
            as: LegacyRecurringList.self)
        return try page.validated(member: member, after: after)
    }
}
