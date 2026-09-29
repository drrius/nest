import Foundation

struct SummaryCount: Codable, Equatable, Sendable {
    let count: Int
    let more: Bool

    func validated() throws {
        guard (0...1000).contains(count), !more || count == 1000 else { throw NestAPIFailure.contract }
    }
}

struct DailySummary: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let recipientId: UUID
    let date: CivilDate
    let choresDue: SummaryCount
    let choresOverdue: SummaryCount
    let mealsPlanned: SummaryCount
    let renewalsDue: SummaryCount
    let cancellationDeadlines: SummaryCount

    func validated(member: VerifiedMember) throws {
        guard version == 1, householdId == member.householdId, recipientId == member.userId else {
            throw NestAPIFailure.contract
        }
        for value in [choresDue, choresOverdue, mealsPlanned, renewalsDue, cancellationDeadlines] {
            try value.validated()
        }
    }
}

struct DailySummarySnapshot: Codable, Equatable, Sendable {
    let version: Int
    let summaryId: UUID
    let summary: DailySummary

    func validated(member: VerifiedMember, id: UUID? = nil) throws -> Self {
        guard version == 1, id == nil || summaryId == id else { throw NestAPIFailure.contract }
        try summary.validated(member: member)
        return self
    }
}

struct LatestDailySummary: Codable, Equatable, Sendable {
    let version: Int
    let householdId: UUID
    let recipientId: UUID
    let latest: DailySummarySnapshot?

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, householdId == member.householdId, recipientId == member.userId else {
            throw NestAPIFailure.contract
        }
        _ = try latest?.validated(member: member)
        return self
    }
}

extension NotificationAPI {
    func latestSummary(token: String, member: VerifiedMember) async throws -> LatestDailySummary {
        let value = try await http.read(
            "v1/latest-daily-summary", token: token, household: member.householdId,
            as: LatestDailySummary.self)
        return try value.validated(member: member)
    }

    func summary(token: String, member: VerifiedMember, id: UUID) async throws -> DailySummarySnapshot {
        let value = try await http.read(
            "v1/daily-summary?summaryId=\(id.uuidString.lowercased())", token: token,
            household: member.householdId, as: DailySummarySnapshot.self)
        return try value.validated(member: member, id: id)
    }
}
