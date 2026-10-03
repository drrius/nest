import Foundation

struct LegacyAdoptionContext: Codable, Equatable, Sendable {
    enum Blocker: String, Codable, Sendable {
        case alreadyAdopted = "already_adopted"
        case identityInUse = "native_identity_in_use"
        case pendingDrafts = "pending_drafts"
        case unreconciledHistory = "unreconciled_history"
        case unsupportedDates = "unsupported_history_dates"
    }
    struct Adoption: Codable, Equatable, Sendable {
        let nativeRuleId: UUID
        let authorizedBy: UUID
        let authorizedAt: String
    }
    let version: Int
    let householdId: UUID
    let rule: LegacyRecurringRule
    let reviewToken: LegacyReviewToken
    let coveredThrough: CivilDate?
    let blockers: [Blocker]
    let adoption: Adoption?

    var canAdopt: Bool { blockers.isEmpty && adoption == nil }

    enum CodingKeys: String, CodingKey {
        case version, householdId, rule, reviewToken, coveredThrough, blockers, adoption
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(version, forKey: .version)
        try values.encode(householdId, forKey: .householdId)
        try values.encode(rule, forKey: .rule)
        try values.encode(reviewToken, forKey: .reviewToken)
        try values.encode(coveredThrough, forKey: .coveredThrough)
        try values.encode(blockers, forKey: .blockers)
        try values.encode(adoption, forKey: .adoption)
    }

    func validated(member: VerifiedMember, ruleId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, rule.id == ruleId, rule.valid,
            blockers.count <= 5, Set(blockers).count == blockers.count
        else { throw NestAPIFailure.contract }
        try validateCounts()
        if let adoption {
            guard adoption.nativeRuleId == ruleId, blockers.contains(.alreadyAdopted),
                MoneyTime.timestamp(adoption.authorizedAt)
            else { throw NestAPIFailure.contract }
        } else if blockers.contains(.alreadyAdopted) {
            throw NestAPIFailure.contract
        }
        return self
    }

    private func validateCounts() throws {
        let reconciled = rule.drafts.postedWithoutEvent == "0" && rule.drafts.unpostedWithEvent == "0"
        guard (rule.drafts.pending == "0") == !blockers.contains(.pendingDrafts),
            reconciled == !blockers.contains(.unreconciledHistory),
            !blockers.contains(.unsupportedDates) || coveredThrough == nil
        else { throw NestAPIFailure.contract }
    }
}
