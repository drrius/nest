import Foundation
import XCTest

@testable import Nest

@MainActor
struct RecurringStateApprovalTestFixture {
    let session: SessionModel
    let server: RecurringStateApprovalTestServer
    let member: VerifiedMember
    let partner: VerifiedMember
    let auth: FakeAuthentication
    let chores: FakeChoreServer
    let url: URL

    static func make(action: RecurringStateInput.Action = .pause, loseReply: Bool = false) async throws -> Self {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner.userId, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner.userId, household: member.householdId)
        let change = RecurringStateInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: .active, action: action)
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner.userId)
        let rule = RecurringRule(
            ruleId: change.ruleId, revision: change.expectedRevision,
            configuration: .init(
                description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .fixed, amountCentimes: try Centimes("101"), allocations: shares),
            status: .active, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: try CivilDate("2026-10-01"))
        let decision = RecurringStateDecision(operationId: UUID(), approvalId: UUID(), change: change, approved: true)
        let server = RecurringStateApprovalTestServer(
            member: member, decision: decision, rule: rule, loseReply: loseReply)
        let url = FileManager.default.temporaryDirectory.appending(path: "state-approval-\(UUID()).sqlite")
        let session = try makeSession(auth: auth, chores: chores, server: server, url: url)
        await session.restore()
        return .init(
            session: session, server: server, member: member, partner: partner, auth: auth, chores: chores, url: url)
    }

    func presentation() async -> RecurringStateApprovalModel {
        RecurringStateApprovalModel(session: session, member: member, approvalId: await server.decision.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let result = try Self.makeSession(auth: auth, chores: chores, server: server, url: url)
        await result.restore()
        return result
    }

    private static func makeSession(
        auth: FakeAuthentication, chores: FakeChoreServer, server: RecurringStateApprovalTestServer, url: URL
    ) throws -> SessionModel {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}

actor RecurringStateApprovalTestServer {
    let member: VerifiedMember
    let decision: RecurringStateDecision
    private var rule: RecurringRule
    private var receipt: RecurringStateReceipt?
    private var status: RecurringApproval.Status = .pending
    private var offline = false
    private var expired = false
    private var loseReply: Bool
    private var consumeDuringExpiry = false
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    private(set) var writes = 0

    init(member: VerifiedMember, decision: RecurringStateDecision, rule: RecurringRule, loseReply: Bool) {
        self.member = member
        self.decision = decision
        self.rule = rule
        self.loseReply = loseReply
    }

    func goOffline() { offline = true }
    func expire(consume: Bool = false) {
        expired = true
        consumeDuringExpiry = consume
    }
    func changeRule() {
        rule = .init(
            ruleId: rule.id, revision: UUID(), configuration: rule.configuration, status: rule.status,
            authorizedBy: rule.authorizedBy, authorizedAt: rule.authorizedAt,
            coveredThrough: rule.coveredThrough, nextDueOn: rule.nextDueOn)
    }
    func pauseNextRead() { pause = true }
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { began = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == member.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let data: Data
        switch request.url!.path {
        case "/v1/money/recurring/state/approval":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            data = try JSONEncoder().encode(envelope())
        case "/v1/money/recurring/rule":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            data = try JSONEncoder().encode(RecurringDetail(
                version: 1, householdId: member.householdId, today: CivilDate("2026-10-01"), rule: rule))
        case "/v1/money/approval-expiry":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            if consumeDuringExpiry { record(decision) }
            data = try JSONEncoder().encode(FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId, command: decision.change.command,
                expiredUnused: expired && status == .pending, checkedAt: "2099-01-01T00:00:00.000000Z"))
        case "/v1/money/recurring/state/approval/decide":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let input = try JSONDecoder().decode(RecurringStateDecision.self, from: XCTUnwrap(request.httpBody))
            guard input.operationId == decision.operationId, input.approvalId == decision.approvalId,
                input.change == decision.change else { throw NestAPIFailure.contract }
            writes += 1
            record(input)
            if loseReply { loseReply = false; throw URLError(.networkConnectionLost) }
            data = try JSONEncoder().encode(envelope())
        default: throw NestAPIFailure.contract
        }
        if pause && request.httpMethod == "GET" {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func record(_ input: RecurringStateDecision) {
        status = input.approved ? .consumed : .denied
        if input.approved {
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: decision.operationId, approvalId: decision.approvalId, revision: UUID(),
                status: decision.change.action == .pause ? .paused : .cancelled, change: decision.change)
        }
    }

    private func envelope() -> RecurringStateApprovalEnvelope {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, change: decision.change, status: status,
                expiresAt: expired ? "2026-10-01T00:00:00.000000Z" : "2099-01-01T00:00:00.000000Z", receipt: receipt))
    }
}
