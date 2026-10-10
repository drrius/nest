import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyAdoptionTestFixture {
    let base: ManualCycleTestFixture
    let session: SessionModel
    let server: LegacyAdoptionTestServer

    static func make() async throws -> Self {
        let base = try await ManualCycleTestFixture.make()
        let rule = LegacyRecurringRule(
            ruleId: UUID(), mode: "legacy_draft_only", description: "Original fictional rule",
            amountCentimes: try Centimes("101"), payerId: base.member.userId,
            allocations: .init(
                kind: .valid,
                shares: try ExpenseSplit.equal(Centimes("101"), payer: base.member.userId, other: base.partner.userId),
                reason: nil), categoryId: nil, active: true,
            nextOccurrenceOn: .init(kind: .date, value: "2026-01-05", reason: nil),
            updatedAt: .init(kind: .timestamp, value: "2026-01-01T10:00:00.123456Z", reason: nil),
            schedule: .init(kind: .weekly, weekday: 1, dayOfMonth: nil),
            drafts: .init(
                pending: "0", posted: "0", dismissed: "1", postedWithoutEvent: "0",
                unpostedWithEvent: "0", unsupportedDates: "0",
                latestDraftOn: .init(kind: .date, value: "2026-01-05", reason: nil)))
        let server = LegacyAdoptionTestServer(
            member: base.member, partner: base.partner,
            context: .init(
                version: 1, householdId: base.member.householdId, rule: rule,
                reviewToken: try LegacyReviewToken(String(repeating: "a", count: 64)),
                coveredThrough: try CivilDate("2026-10-05"), blockers: [], adoption: nil))
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil, member: VerifiedMember? = nil) async -> LegacyAdoptionModel {
        LegacyAdoptionModel(
            session: session ?? self.session, member: member ?? base.member, ruleId: await server.ruleId)
    }

    func newTerms() throws -> RecurringDraft {
        var draft = RecurringDraft(member: base.member, today: try CivilDate("2026-10-03"))
        draft.description = "New explicit rule"
        draft.mode = .fixed
        draft.amount = "2.01"
        draft.shares = [base.member.userId: "1.01", base.partner.userId: "1.00"]
        draft.scheduleDay = 5
        draft.note = "New note"
        return draft
    }

    func reviewedModel(session: SessionModel? = nil, member: VerifiedMember? = nil) async throws
        -> LegacyAdoptionModel
    {
        let model = await presentation(session: session, member: member)
        await model.load()
        try model.prepare(newTerms())
        return model
    }

    func reopenedSession() async throws -> SessionModel {
        let session = try Self.makeSession(base: base, server: server)
        await session.restore()
        return session
    }

    private static func makeSession(base: ManualCycleTestFixture, server: LegacyAdoptionTestServer) throws
        -> SessionModel
    {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await base.chores.respond($0)
        }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: base.auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: base.url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}
