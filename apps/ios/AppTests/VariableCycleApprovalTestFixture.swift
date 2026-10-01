import Foundation
import XCTest

@testable import Nest

@MainActor
struct VariableCycleApprovalTestFixture {
    let session: SessionModel
    let server: VariableCycleApprovalTestServer
    let member: VerifiedMember
    let partner: VerifiedMember
    let auth: FakeAuthentication
    let chores: FakeChoreServer
    let url: URL

    static func make(loseReply: Bool = false) async throws -> Self {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner.userId, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner.userId, household: member.householdId)
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner.userId)
        let input = VariableCycleInput(
            ruleId: UUID(), expectedRevision: UUID(), dueOn: try CivilDate("2026-10-01"),
            amountCentimes: try Centimes("101"), allocations: shares)
        let rule = RecurringRule(
            ruleId: input.ruleId, revision: input.expectedRevision,
            configuration: .init(
                description: "Synthetic bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .variable, amountCentimes: nil, allocations: nil),
            status: .active, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: try CivilDate("2026-10-01"))
        let decision = VariableCycleDecision(operationId: UUID(), approvalId: UUID(), input: input, approved: true)
        let server = VariableCycleApprovalTestServer(
            member: member, decision: decision, rule: rule, loseReply: loseReply)
        let url = FileManager.default.temporaryDirectory.appending(path: "variable-approval-\(UUID()).sqlite")
        let session = try makeSession(auth: auth, chores: chores, server: server, url: url)
        await session.restore()
        return .init(
            session: session, server: server, member: member, partner: partner, auth: auth, chores: chores, url: url)
    }

    func presentation() async -> VariableCycleApprovalModel {
        VariableCycleApprovalModel(session: session, member: member, approvalId: await server.decision.approvalId)
    }

    func reopenedSession() async throws -> SessionModel {
        let result = try Self.makeSession(auth: auth, chores: chores, server: server, url: url)
        await result.restore()
        return result
    }

    private static func makeSession(
        auth: FakeAuthentication, chores: FakeChoreServer, server: VariableCycleApprovalTestServer, url: URL
    ) throws -> SessionModel {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}

actor VariableCycleApprovalTestServer {
    let member: VerifiedMember
    let decision: VariableCycleDecision
    private var rule: RecurringRule
    private var receipt: VariableCycleReceipt?
    private var status: VariableCycleApproval.Status = .pending
    private var offline = false
    private var foreignMember = false
    private var expired = false
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

    init(member: VerifiedMember, decision: VariableCycleDecision, rule: RecurringRule, loseReply: Bool) {
        self.member = member
        self.decision = decision
        self.rule = rule
        self.loseReply = loseReply
    }

    func goOffline() { offline = true }
    func replacePartner() { foreignMember = true }
    func expire(consume: Bool = false) {
        expired = true
        consumeDuringExpiry = consume
    }
    func changeRule(failFencedRead: Bool = false) {
        self.failFencedRead = failFencedRead
        approvalReads = 0
        rule = .init(
            ruleId: rule.id, revision: UUID(), configuration: rule.configuration, status: rule.status,
            authorizedBy: rule.authorizedBy, authorizedAt: rule.authorizedAt,
            coveredThrough: rule.coveredThrough, nextDueOn: rule.nextDueOn)
    }
    func coverCycle(failFencedRead: Bool = false, consumeDuringFence: Bool = false) throws {
        self.failFencedRead = failFencedRead
        self.consumeDuringFence = consumeDuringFence
        approvalReads = 0
        rule = .init(
            ruleId: rule.id, revision: rule.revision, configuration: rule.configuration, status: rule.status,
            authorizedBy: rule.authorizedBy, authorizedAt: rule.authorizedAt,
            coveredThrough: try CivilDate("2026-10-31"), nextDueOn: try CivilDate("2026-11-01"))
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
        case "/v1/money/recurring/variable/approval":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            approvalReads += 1
            if approvalReads == 2 && failFencedRead {
                failFencedRead = false
                throw URLError(.networkConnectionLost)
            }
            if approvalReads == 2 && consumeDuringFence { try record(decision) }
            data = try JSONEncoder().encode(envelope())
        case "/v1/money/balance":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            let members = try decision.input.allocations.map {
                MoneyBalance.Member(
                    actorId: foreignMember && $0.memberId != member.userId ? UUID() : $0.memberId,
                    displayName: $0.memberId == member.userId ? "Alex" : "Sam", centimes: try Centimes("0"))
            }
            data = try JSONEncoder().encode(
                MoneyBalance(
                    version: 1, householdId: member.householdId, eventCount: "0", openingEstablished: false,
                    members: members))
        case "/v1/money/recurring/rule":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            let detail = RecurringDetail(
                version: 1, householdId: member.householdId, today: try CivilDate("2026-10-01"), rule: rule)
            data = try JSONEncoder().encode(detail)
        case "/v1/money/approval-expiry":
            guard request.httpMethod == "GET" else { throw NestAPIFailure.contract }
            if consumeDuringExpiry { try record(decision) }
            let expiry = FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId, command: .recordCycle,
                expiredUnused: expired && status == .pending, checkedAt: "2099-01-01T00:00:00.000000Z")
            data = try JSONEncoder().encode(expiry)
        case "/v1/money/recurring/variable/approval/decide":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let input = try JSONDecoder().decode(VariableCycleDecision.self, from: XCTUnwrap(request.httpBody))
            guard input.operationId == decision.operationId, input.approvalId == decision.approvalId,
                input.input == decision.input
            else { throw NestAPIFailure.contract }
            writes += 1
            try record(input)
            if loseReply {
                loseReply = false
                throw URLError(.networkConnectionLost)
            }
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

    private func record(_ input: VariableCycleDecision) throws {
        status = input.approved ? .consumed : .denied
        if input.approved {
            let expense = ExpenseInput(
                description: rule.configuration.description, amountCentimes: input.input.amountCentimes,
                receiptPath: nil, receiptTotalCentimes: nil, payerId: rule.configuration.payerId,
                allocations: input.input.allocations, date: input.input.dueOn, note: rule.configuration.note,
                categoryId: rule.configuration.categoryId)
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: decision.operationId, approvalId: decision.approvalId, source: "variable", eventId: UUID(),
                input: input.input,
                cycle: try RecurringDates.cycle(schedule: rule.configuration.schedule, dueOn: input.input.dueOn),
                configuration: rule.configuration, expense: expense)
        }
    }

    private func envelope() -> VariableCycleApprovalEnvelope {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, input: decision.input, status: status,
                expiresAt: expired ? "2026-10-01T00:00:00.000000Z" : "2099-01-01T00:00:00.000000Z", receipt: receipt))
    }
}
