import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyConfirmationApprovalTestFixture {
    let base: LegacyConfirmationTestFixture
    let session: SessionModel
    let server: LegacyConfirmationApprovalTestServer

    static func make() async throws -> Self {
        let base = try await LegacyConfirmationTestFixture.make()
        let original = await base.server.original
        let input = LegacyConfirmInput(
            draftId: original.draft.id, ruleId: original.draft.ruleId,
            reviewToken: original.reviewToken, expense: try base.expense())
        let server = LegacyConfirmationApprovalTestServer(
            owner: base.base.member, original: original, source: base.server, input: input)
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil) async -> LegacyConfirmationApprovalModel {
        LegacyConfirmationApprovalModel(
            session: session ?? self.session, member: base.base.member, approvalId: await server.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let session = try Self.makeSession(base: base, server: server)
        await session.restore()
        return session
    }

    private static func makeSession(
        base: LegacyConfirmationTestFixture, server: LegacyConfirmationApprovalTestServer
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

actor LegacyConfirmationApprovalTestServer {
    let owner: VerifiedMember
    let original: LegacyDraftContext
    let source: LegacyConfirmationTestServer
    let input: LegacyConfirmInput
    let approvalId = UUID()
    let operationId = UUID()
    private var status = LegacyConfirmationApproval.Status.pending
    private var receipt: LegacyConfirmationReceipt?
    private var expiresAt = "2099-12-31T00:00:00.000000Z"
    private var loseReply = false
    private var failReply = false
    private var offline = false
    private var contextMissing = false
    private(set) var sends = 0
    private(set) var postings = 0
    private(set) var lastDecision: LegacyConfirmationDecision?

    init(
        owner: VerifiedMember, original: LegacyDraftContext, source: LegacyConfirmationTestServer,
        input: LegacyConfirmInput
    ) {
        self.owner = owner
        self.original = original
        self.source = source
        self.input = input
    }
    func loseNextReply() { loseReply = true }
    func failNextReply() { failReply = true }
    func setOffline(_ value: Bool) { offline = value }
    func hideDraftContext() { contextMissing = true }
    func expire() { expiresAt = "2000-01-01T00:00:00.000000Z" }
    func commitApproved() {
        guard !envelope().approval.isTerminal else { return }
        receipt = .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: operationId, approvalId: approvalId, input: input,
            reviewed: original, eventId: UUID(), status: "posted")
        status = .consumed
        postings += 1
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == owner.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let url = try XCTUnwrap(request.url)
        let data: Data
        switch url.path {
        case "/v1/money/recurring/legacy-confirmation/approval":
            try query(request)
            data = try JSONEncoder().encode(envelope())
        case "/v1/money/recurring/legacy-confirmation/approval/context":
            try query(request)
            if contextMissing {
                return (Data(), HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: nil)!)
            }
            data = try JSONEncoder().encode(await currentContext())
        case "/v1/money/recurring/legacy-confirmation/approval/decide":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let decision = try JSONDecoder().decode(LegacyConfirmationDecision.self, from: XCTUnwrap(request.httpBody))
            data = try await decide(decision)
        case "/v1/money/balance": return try await source.respond(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func query(_ request: URLRequest) throws {
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard request.httpMethod == "GET", items.count == 1, items[0].name == "approvalId",
            items[0].value.flatMap(UUID.init(uuidString:)) == approvalId
        else { throw NestAPIFailure.contract }
    }

    private func envelope() -> LegacyConfirmationApprovalEnvelope {
        .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            approval: .init(
                id: approvalId, operationId: operationId, input: input,
                status: status, expiresAt: expiresAt, receipt: receipt))
    }

    private func currentContext() async throws -> LegacyConfirmationProposalContext {
        let path = "https://nest.example/v1/money/recurring/legacy-dismissal/context"
        var request = URLRequest(
            url: URL(
                string: "\(path)?draftId=\(original.draft.id.uuidString.lowercased())"
            )!)
        request.httpMethod = "GET"
        request.setValue("Bearer token-A", forHTTPHeaderField: "Authorization")
        request.setValue(owner.householdId.uuidString.lowercased(), forHTTPHeaderField: "x-nest-household")
        let response = try await source.respond(request)
        let reviewed = try JSONDecoder().decode(LegacyDraftContext.self, from: response.0)
        return .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId, approvalId: approvalId,
            input: input, review: reviewed)
    }

    private func decide(_ decision: LegacyConfirmationDecision) async throws -> Data {
        _ = try envelope().matching(decision, member: owner)
        sends += 1
        lastDecision = decision
        if failReply {
            failReply = false
            throw URLError(.networkConnectionLost)
        }
        if !envelope().approval.isTerminal {
            if decision.approved {
                let current = try await currentContext()
                guard current.matches, ApprovalTime.isOpen(expiresAt, now: .now) else {
                    throw NestAPIFailure.conflict
                }
                commitApproved()
            } else {
                status = .denied
            }
        }
        if loseReply {
            loseReply = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(envelope())
    }
}
