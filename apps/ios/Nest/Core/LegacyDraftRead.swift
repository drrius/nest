import Foundation

struct LegacyRecurringDraft: Decodable, Equatable, Identifiable, Sendable {
    enum Status: String, Decodable { case pending, posted, dismissed }
    enum Source: String, Decodable { case shopping, recurring }
    let draftId: UUID
    let ruleId: UUID
    let description: String
    let amountCentimes: Centimes?
    let payerId: UUID?
    let allocations: LegacyRecurringSplit
    let categoryId: UUID?
    let sourceKind: Source
    let shoppingSessionId: UUID?
    let occurredOn: LegacyTemporalValue
    let status: Status
    let updatedAt: LegacyTemporalValue
    let eventId: UUID?
    var id: UUID { draftId }

    var valid: Bool {
        LegacyRecurringLabel.valid(description) && (amountCentimes?.value ?? 0) >= 0
            && allocations.valid(amount: amountCentimes, payer: payerId)
            && (sourceKind == .shopping) == (shoppingSessionId != nil)
            && occurredOn.valid(expected: .date) && updatedAt.valid(expected: .timestamp)
    }

    var needsReconciliation: Bool {
        (status == .posted) != (eventId != nil) || occurredOn.kind == .unsupported
    }
}

struct LegacyDraftList: Decodable, Sendable {
    let version: Int
    let householdId: UUID
    let ruleId: UUID
    let after: UUID?
    let next: UUID?
    let drafts: [LegacyRecurringDraft]

    func validated(member: VerifiedMember, ruleId expected: UUID, after cursor: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, ruleId == expected, after == cursor,
            drafts.count <= 20, drafts.allSatisfy({ $0.valid && $0.ruleId == expected }),
            next == nil || (drafts.count == 20 && next == drafts.last?.id)
        else { throw NestAPIFailure.contract }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for row in drafts {
            let id = row.id.uuidString.lowercased()
            guard id > previous else { throw NestAPIFailure.contract }
            previous = id
        }
        return self
    }
}

extension MoneyAPI {
    func legacyDrafts(token: String, member: VerifiedMember, ruleId: UUID, after: UUID?) async throws
        -> LegacyDraftList
    {
        let query = after.map { "&after=\($0.uuidString.lowercased())" } ?? ""
        let page = try await http.read(
            "v1/money/recurring/legacy-drafts?ruleId=\(ruleId.uuidString.lowercased())\(query)",
            token: token, household: member.householdId, as: LegacyDraftList.self)
        return try page.validated(member: member, ruleId: ruleId, after: after)
    }
}
