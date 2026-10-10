import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyAdoptionApprovalTestFixture {
    let base: LegacyAdoptionTestFixture
    let session: SessionModel
    let server: LegacyAdoptionApprovalTestServer

    static func make(selectedCategory: Bool = false) async throws -> Self {
        let base = try await LegacyAdoptionTestFixture.make()
        let original = await base.server.original
        var draft = try base.newTerms()
        if selectedCategory { draft.categoryId = UUID() }
        let configuration = try draft.reviewed(
            member: base.base.member,
            members: [base.base.member.userId, base.base.partner.userId], today: CivilDate("2026-10-03")
        ).configuration
        let input = LegacyAdoptionInput(
            ruleId: original.rule.id, reviewToken: original.reviewToken,
            configuration: configuration,
            firstDueOn: try XCTUnwrap(
                RecurringDates.firstUncovered(
                    schedule: configuration.schedule, from: configuration.startDate,
                    coveredThrough: original.coveredThrough)))
        let server = LegacyAdoptionApprovalTestServer(
            owner: base.base.member, original: original, source: base.server, input: input)
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil) async -> LegacyAdoptionApprovalModel {
        LegacyAdoptionApprovalModel(
            session: session ?? self.session, member: base.base.member, approvalId: await server.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let session = try Self.makeSession(base: base, server: server)
        await session.restore()
        return session
    }

    private static func makeSession(
        base: LegacyAdoptionTestFixture, server: LegacyAdoptionApprovalTestServer
    ) throws -> SessionModel {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await base.base.chores.respond($0)
        }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: base.base.auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: base.base.url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}
