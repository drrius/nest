import Foundation

struct LegacyReviewToken: Codable, Equatable, Sendable {
    let value: String

    init(_ value: String) throws {
        guard value.utf8.count == 64, value.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) })
        else {
            throw NestAPIFailure.contract
        }
        self.value = value
    }
    init(from decoder: Decoder) throws { try self.init(decoder.singleValueContainer().decode(String.self)) }
    func encode(to encoder: Encoder) throws {
        var values = encoder.singleValueContainer()
        try values.encode(value)
    }
}

struct LegacyDraftContext: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let draft: LegacyRecurringDraft
    let reviewToken: LegacyReviewToken

    func validated(member: VerifiedMember, draftId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, draft.id == draftId, draft.valid else {
            throw NestAPIFailure.contract
        }
        return self
    }

    var canDismiss: Bool { draft.status == .pending && draft.sourceKind == .recurring && draft.eventId == nil }

    var dismissalInput: LegacyDismissInput {
        .init(draftId: draft.id, ruleId: draft.ruleId, reviewToken: reviewToken)
    }
}

extension MoneyAPI {
    func legacyDraftContext(token: String, member: VerifiedMember, draftId: UUID) async throws -> LegacyDraftContext {
        let result = try await http.read(
            "v1/money/recurring/legacy-dismissal/context?draftId=\(draftId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyDraftContext.self)
        return try result.validated(member: member, draftId: draftId)
    }
}
