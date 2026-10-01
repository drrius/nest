import Foundation
import XCTest

@testable import Nest

@MainActor
struct ManualCycleTestFixture {
    let session: SessionModel
    let server: ManualCycleTestServer
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
        let rule = RecurringRule(
            ruleId: UUID(), revision: UUID(),
            configuration: .init(
                description: "Synthetic fixed bill", payerId: partner.userId, categoryId: nil, note: "Rule note",
                startDate: try CivilDate("2026-10-01"), schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .fixed, amountCentimes: try Centimes("990"),
                allocations: try ExpenseSplit.equal(Centimes("990"), payer: partner.userId, other: member.userId)),
            status: .active, authorizedBy: member.userId, authorizedAt: "2026-10-01T00:00:00.000000Z",
            coveredThrough: nil, nextDueOn: try CivilDate("2026-10-01"))
        let event = MoneyEventSummary(
            eventId: UUID(), kind: .expense, occurredOn: "2026-10-02", createdAt: "2026-10-02T00:00:00.000000Z",
            occurredOrder: "1790899200000000", createdOrder: "1790899200000000",
            description: "Synthetic existing expense", amountCentimes: try Centimes("101"),
            createdBy: member.userId, payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        let source = MoneyDetail(
            version: 1, householdId: member.householdId, event: event, receiptTotalCentimes: nil, note: "Expense note",
            category: nil, reversedById: nil,
            shares: [
                .init(
                    memberId: member.userId, allocatedCentimes: try Centimes("51"), deltaCentimes: try Centimes("50")),
                .init(
                    memberId: partner.userId, allocatedCentimes: try Centimes("50"), deltaCentimes: try Centimes("-50")),
            ])
        let server = ManualCycleTestServer(member: member, rule: rule, source: source, loseReply: loseReply)
        let url = FileManager.default.temporaryDirectory.appending(path: "manual-cycle-\(UUID()).sqlite")
        let session = try makeSession(auth: auth, chores: chores, server: server, url: url)
        await session.restore()
        return .init(
            session: session, server: server, member: member, partner: partner, auth: auth, chores: chores, url: url)
    }

    func presentation(session: SessionModel? = nil) async -> ManualCycleModel {
        ManualCycleModel(session: session ?? self.session, member: member, ruleId: await server.ruleId)
    }

    func reopenedSession() async throws -> SessionModel {
        let result = try Self.makeSession(auth: auth, chores: chores, server: server, url: url)
        await result.restore()
        return result
    }

    private static func makeSession(
        auth: FakeAuthentication, chores: FakeChoreServer, server: ManualCycleTestServer, url: URL
    ) throws -> SessionModel {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}

actor ManualCycleTestServer {
    let member: VerifiedMember
    private var rule: RecurringRule
    private var source: MoneyDetail
    private var receipt: ManualCycleReceipt?
    private var cancelledOperation: UUID?
    private var fault = "none"
    private var olderEvents: [MoneyEventSummary] = []
    private var loseReply: Bool
    private var loseCancellation = false
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    private(set) var writes = 0
    private(set) var cancellations = 0
    var ruleId: UUID { rule.id }
    var sourceId: UUID { source.event.id }

    init(member: VerifiedMember, rule: RecurringRule, source: MoneyDetail, loseReply: Bool) {
        self.member = member
        self.rule = rule
        self.source = source
        self.loseReply = loseReply
    }

    func usePaginatedHistory() {
        olderEvents = (1...50).map { offset in
            .init(
                eventId: UUID(), kind: source.event.kind, occurredOn: source.event.occurredOn,
                createdAt: source.event.createdAt, occurredOrder: String(1_790_899_200_000_000 - offset),
                createdOrder: String(1_790_899_200_000_000 - offset), description: "Synthetic older expense",
                amountCentimes: source.event.amountCentimes, createdBy: member.userId, payerId: member.userId,
                relatedEventId: nil, hasReceipt: false)
        }
    }
    func setFault(_ value: String) { fault = value }
    func dropNextCancellation() { loseCancellation = true }
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
        guard fault != "offline" else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == member.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let data: Data
        switch request.url!.path {
        case "/v1/money/balance": data = try JSONEncoder().encode(balance())
        case "/v1/money/recurring/rule": data = try JSONEncoder().encode(target())
        case "/v1/money/history": data = try JSONEncoder().encode(history(request))
        case "/v1/money/detail": data = try JSONEncoder().encode(currentSource())
        case "/v1/money/recurring/manual/receipt":
            guard let operation = operation(request) else { throw NestAPIFailure.contract }
            data = try JSONEncoder().encode(recovery(operation))
        case "/v1/money/recurring/manual/save":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let command = try JSONDecoder().decode(SaveManualCycle.self, from: XCTUnwrap(request.httpBody))
            try command.input.validated(member: member, balance: balance(), target: target(), source: currentSource())
            guard cancelledOperation != command.operationId else { throw NestAPIFailure.conflict }
            writes += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, source: "manual", eventId: source.event.id,
                input: command.input,
                cycle: try RecurringDates.cycle(schedule: rule.configuration.schedule, dueOn: command.input.dueOn),
                configuration: rule.configuration, linkedExpense: source)
            if loseReply {
                loseReply = false
                throw URLError(.networkConnectionLost)
            }
            data = try JSONEncoder().encode(receipt)
        case "/v1/money/recurring/manual/cancel-save":
            let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String]
            guard let operation = body?["operationId"].flatMap(UUID.init(uuidString:)) else {
                throw NestAPIFailure.contract
            }
            cancellations += 1
            if receipt == nil { cancelledOperation = operation }
            if loseCancellation {
                loseCancellation = false
                throw URLError(.networkConnectionLost)
            }
            data = try JSONEncoder().encode(recovery(operation))
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

    private func operation(_ request: URLRequest) -> UUID? {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { $0.name == "operationId" })?.value.flatMap(UUID.init(uuidString:))
    }

    private func recovery(_ operation: UUID) -> ManualCycleRecovery {
        .init(
            version: 1, actorId: member.userId, householdId: member.householdId, operationId: operation,
            status: receipt != nil ? .recorded : cancelledOperation == operation ? .cancelled : .unresolved,
            receipt: receipt)
    }

    private func history(_ request: URLRequest) throws -> MoneyHistory {
        let text = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { $0.name == "before" })?.value
        let cursor = text.flatMap(UUID.init(uuidString:))
        let all = [source.event] + olderEvents
        let events: [MoneyEventSummary]
        if let cursor {
            guard let index = all.firstIndex(where: { $0.id == cursor }) else { throw NestAPIFailure.contract }
            events = Array(all.dropFirst(index + 1).prefix(50))
        } else {
            events = Array(all.prefix(50))
        }
        return .init(
            version: 1, householdId: member.householdId, before: cursor,
            next: events.count == 50 ? events.last?.id : nil, events: events)
    }

    private func balance() throws -> MoneyBalance {
        let people = try source.shares.map {
            MoneyBalance.Member(
                actorId: fault == "member" && $0.id != member.userId ? UUID() : $0.id,
                displayName: $0.id == member.userId ? "Alex" : "Sam", centimes: try Centimes("0"))
        }
        return .init(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false, members: people)
    }

    private func target() throws -> RecurringDetail {
        .init(
            version: 1, householdId: member.householdId,
            today: try CivilDate(fault == "future" ? "2026-09-30" : "2026-10-01"),
            rule: .init(
                ruleId: rule.id, revision: fault == "revision" ? UUID() : rule.revision,
                configuration: rule.configuration,
                status: fault == "paused" ? .paused : .active, authorizedBy: rule.authorizedBy,
                authorizedAt: rule.authorizedAt,
                coveredThrough: fault == "covered" ? try CivilDate("2026-10-31") : nil, nextDueOn: rule.nextDueOn))
    }

    private func currentSource() -> MoneyDetail {
        .init(
            version: source.version, householdId: source.householdId, event: source.event,
            receiptTotalCentimes: source.receiptTotalCentimes, note: source.note, category: source.category,
            reversedById: fault == "reversed" ? UUID() : nil, shares: source.shares)
    }
}
