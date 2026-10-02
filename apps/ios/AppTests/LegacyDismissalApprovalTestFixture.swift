import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyDismissalApprovalTestFixture {
    let base: LegacyDismissalTestFixture
    let session: SessionModel
    let server: LegacyDismissalApprovalTestServer

    static func make() async throws -> Self {
        let base = try await LegacyDismissalTestFixture.make()
        let original = await base.server.original
        let server = LegacyDismissalApprovalTestServer(owner: base.base.member, original: original, source: base.server)
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil) async -> LegacyDismissalApprovalModel {
        LegacyDismissalApprovalModel(
            session: session ?? self.session, member: base.base.member, approvalId: await server.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let session = try Self.makeSession(base: base, server: server)
        await session.restore()
        return session
    }

    private static func makeSession(
        base: LegacyDismissalTestFixture, server: LegacyDismissalApprovalTestServer
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

actor LegacyDismissalApprovalTestServer {
    let owner: VerifiedMember
    let original: LegacyDraftContext
    let source: LegacyDismissalTestServer
    let approvalId = UUID()
    let operationId = UUID()
    private var status = LegacyDismissalApproval.Status.pending
    private var receipt: LegacyDismissalReceipt?
    private var expiresAt = "2099-12-31T00:00:00.000000Z"
    private var loseReply = false
    private var failReply = false
    private var offline = false
    private(set) var sends = 0
    private(set) var dismissals = 0
    private(set) var lastDecision: LegacyDismissalDecision?

    init(owner: VerifiedMember, original: LegacyDraftContext, source: LegacyDismissalTestServer) {
        self.owner = owner
        self.original = original
        self.source = source
    }
    func loseNextReply() { loseReply = true }
    func failNextReply() { failReply = true }
    func setOffline(_ value: Bool) { offline = value }
    func expire() { expiresAt = "2000-01-01T00:00:00.000000Z" }
    func commitApproved() {
        guard !envelope().approval.isTerminal else { return }
        receipt = .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: operationId, approvalId: approvalId, input: original.dismissalInput,
            reviewed: original, status: "dismissed")
        status = .consumed
        dismissals += 1
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == owner.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let url = try XCTUnwrap(request.url)
        let data: Data
        switch url.path {
        case "/v1/money/recurring/legacy-dismissal/approval":
            try query(request)
            data = try JSONEncoder().encode(envelope())
        case "/v1/money/recurring/legacy-dismissal/approval/context":
            try query(request)
            data = try JSONEncoder().encode(await currentContext())
        case "/v1/money/recurring/legacy-dismissal/approval/decide":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let decision = try JSONDecoder().decode(LegacyDismissalDecision.self, from: XCTUnwrap(request.httpBody))
            data = try await decide(decision)
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

    private func envelope() -> LegacyDismissalApprovalEnvelope {
        .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            approval: .init(
                id: approvalId, operationId: operationId, input: original.dismissalInput,
                status: status, expiresAt: expiresAt, receipt: receipt))
    }

    private func currentContext() async throws -> LegacyDismissalProposalContext {
        var request = URLRequest(
            url: URL(
                string: "https://nest.example/v1/money/recurring/legacy-dismissal/context?draftId=\(original.draft.id.uuidString.lowercased())"
            )!)
        request.httpMethod = "GET"
        request.setValue("Bearer token-A", forHTTPHeaderField: "Authorization")
        request.setValue(owner.householdId.uuidString.lowercased(), forHTTPHeaderField: "x-nest-household")
        let response = try await source.respond(request)
        let reviewed = try JSONDecoder().decode(LegacyDraftContext.self, from: response.0)
        return .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId, approvalId: approvalId,
            input: original.dismissalInput, review: reviewed)
    }

    private func decide(_ decision: LegacyDismissalDecision) async throws -> Data {
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
