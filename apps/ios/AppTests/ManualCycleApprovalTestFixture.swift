import Foundation
import XCTest

@testable import Nest

@MainActor
struct ManualCycleApprovalTestFixture {
    let base: ManualCycleTestFixture
    let session: SessionModel
    let server: ManualCycleApprovalTestServer
    var member: VerifiedMember { base.member }
    var url: URL { base.url }

    static func make(loseReply: Bool = false) async throws -> Self {
        let base = try await ManualCycleTestFixture.make()
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await base.server.respond($0) }
        let api = MoneyAPI(http: http)
        let target = try await api.recurringRule(token: "token-A", member: base.member, ruleId: base.server.ruleId)
        let detail = try await api.detail(token: "token-A", member: base.member, eventId: base.server.sourceId)
        let input = ManualCycleInput(
            ruleId: target.rule.id, expectedRevision: target.rule.revision,
            dueOn: try XCTUnwrap(target.rule.nextDueOn), sourceEventId: detail.event.id)
        let decision = ManualCycleDecision(operationId: UUID(), approvalId: UUID(), input: input, approved: true)
        let context = ManualCycleContext(
            version: 1, actorId: base.member.userId, householdId: base.member.householdId,
            approvalId: decision.approvalId, input: input, target: target, detail: detail, linked: false)
        let server = ManualCycleApprovalTestServer(
            member: base.member, decision: decision, retained: context,
            api: api, base: base.server, loseReply: loseReply)
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil) async -> ManualCycleApprovalModel {
        ManualCycleApprovalModel(
            session: session ?? self.session, member: member, approvalId: await server.decision.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let result = try Self.makeSession(base: base, server: server)
        await result.restore()
        return result
    }

    private static func makeSession(base: ManualCycleTestFixture, server: ManualCycleApprovalTestServer) throws
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

actor ManualCycleApprovalTestServer {
    let member: VerifiedMember
    let decision: ManualCycleDecision
    private let retained: ManualCycleContext
    private let api: MoneyAPI
    private let base: ManualCycleTestServer
    private var receipt: ManualCycleReceipt?
    private var status: ManualCycleApproval.Status = .pending
    private var expired = false
    private var linked = false
    private var loseReply: Bool
    private var consumeDuringExpiry = false
    private var approvalReads = 0
    private var failFencedRead = false
    private var consumeDuringFence = false
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    private(set) var writes = 0

    init(
        member: VerifiedMember, decision: ManualCycleDecision, retained: ManualCycleContext,
        api: MoneyAPI, base: ManualCycleTestServer, loseReply: Bool
    ) {
        self.member = member
        self.decision = decision
        self.retained = retained
        self.api = api
        self.base = base
        self.loseReply = loseReply
    }

    func setFault(_ value: String) async { await base.setFault(value) }
    func expire(consume: Bool = false) {
        expired = true
        consumeDuringExpiry = consume
    }
    func change(_ value: String, failFence: Bool = false, consumeAtFence: Bool = false) async {
        failFencedRead = failFence
        consumeDuringFence = consumeAtFence
        approvalReads = 0
        linked = value == "linked"
        await base.setFault(value)
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
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == member.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let data: Data
        switch request.url!.path {
        case "/v1/money/recurring/manual/approval":
            data = try approvalData(request)
        case "/v1/money/recurring/manual/approval/context":
            let target = try await api.recurringRule(token: "token-A", member: member, ruleId: decision.input.ruleId)
            let detail = try await api.detail(token: "token-A", member: member, eventId: decision.input.sourceEventId)
            data = try JSONEncoder().encode(
                ManualCycleContext(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    approvalId: decision.approvalId, input: decision.input,
                    target: target, detail: detail, linked: linked))
        case "/v1/money/approval-expiry":
            if consumeDuringExpiry { try record(decision) }
            data = try JSONEncoder().encode(
                FinancialApprovalExpiry(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    approvalId: decision.approvalId, operationId: decision.operationId, command: .linkCycle,
                    expiredUnused: expired && status == .pending, checkedAt: "2099-01-01T00:00:00.000000Z"))
        case "/v1/money/recurring/manual/approval/decide":
            data = try decisionData(request)
        default: return try await base.respond(request)
        }
        await pauseRead(request)
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func approvalData(_ request: URLRequest) throws -> Data {
        approvalReads += 1
        if approvalReads == 2 && failFencedRead {
            failFencedRead = false
            throw URLError(.networkConnectionLost)
        }
        if approvalReads == 2 && consumeDuringFence { try record(decision) }
        return try JSONEncoder().encode(envelope())
    }

    private func pauseRead(_ request: URLRequest) async {
        if pause && request.httpMethod == "GET" {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
    }

    private func decisionData(_ request: URLRequest) throws -> Data {
        guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
        let input = try JSONDecoder().decode(ManualCycleDecision.self, from: XCTUnwrap(request.httpBody))
        guard input.operationId == decision.operationId, input.approvalId == decision.approvalId,
            input.input == decision.input
        else { throw NestAPIFailure.contract }
        writes += 1
        try record(input)
        if loseReply {
            loseReply = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(envelope())
    }

    private func record(_ input: ManualCycleDecision) throws {
        status = input.approved ? .consumed : .denied
        if input.approved {
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, approvalId: input.approvalId,
                source: "manual", eventId: input.input.sourceEventId, input: input.input,
                cycle: try RecurringDates.cycle(
                    schedule: retained.target.rule.configuration.schedule, dueOn: input.input.dueOn),
                configuration: retained.target.rule.configuration, linkedExpense: retained.detail)
        }
    }

    private func envelope() -> ManualCycleApprovalEnvelope {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, input: decision.input, status: status,
                expiresAt: expired ? "2026-10-01T00:00:00.000000Z" : "2099-01-01T00:00:00.000000Z", receipt: receipt))
    }
}
