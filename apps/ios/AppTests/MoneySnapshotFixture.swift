import Foundation

@testable import Nest

@MainActor
struct MoneySnapshotFixture {
    let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    let partner = UUID()
    let eventId = UUID()
    let url: URL
    let auth: FakeAuthentication
    let chores: FakeChoreServer
    let server: MoneySnapshotServer
    let choreAPI: ChoreAPI
    let moneyAPI: MoneyAPI

    init() throws {
        url = FileManager.default.temporaryDirectory.appending(path: "money-snapshot-\(UUID()).sqlite")
        auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let balance = MoneyBalance(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("101")),
                .init(actorId: partner, displayName: "Sam", centimes: try Centimes("-101")),
            ])
        let event = MoneyEventSummary(
            eventId: eventId, kind: .settlement, occurredOn: "2026-09-28", createdAt: "2026-09-28T00:00:00.000000Z",
            occurredOrder: "1", createdOrder: "1", description: "Fixture", amountCentimes: try Centimes("101"),
            createdBy: member.userId, payerId: member.userId, relatedEventId: nil, hasReceipt: false)
        let detail = MoneyDetail(
            version: 1, householdId: member.householdId, event: event, receiptTotalCentimes: nil, note: nil,
            category: nil, reversedById: nil,
            shares: [
                .init(memberId: member.userId, allocatedCentimes: nil, deltaCentimes: try Centimes("101")),
                .init(memberId: partner, allocatedCentimes: nil, deltaCentimes: try Centimes("-101")),
            ])
        let encoder = JSONEncoder()
        server = MoneySnapshotServer(payloads: [
            "balance": try encoder.encode(balance),
            "history": try encoder.encode(
                MoneyHistory(
                    version: 1, householdId: member.householdId, before: nil,
                    next: nil, events: [event])),
            eventId.uuidString.lowercased(): try encoder.encode(detail),
        ])
        let chores = chores
        let server = server
        let origin = URL(string: "https://nest.example")!
        choreAPI = ChoreAPI(
            http: try NestHTTP(baseURL: origin) { request in
                if let response = await server.membershipFailure(request) { return response }
                return try await chores.respond(request)
            })
        moneyAPI = MoneyAPI(http: try NestHTTP(baseURL: origin) { try await server.respond($0) })
    }

    func model() throws -> SessionModel {
        SessionModel(auth: auth, chores: choreAPI, offline: try ChoreOfflineStore(url: url), moneyAPI: moneyAPI)
    }

    func seed(_ model: SessionModel) async throws {
        _ = try await model.loadMoneyBalance(member: member, generation: model.generation)
        _ = try await model.loadMoneyHistory(member: member, generation: model.generation, before: nil)
        _ = try await model.loadMoneyDetail(member: member, generation: model.generation, eventId: eventId)
    }
}

actor MoneySnapshotServer {
    let payloads: [String: Data]
    var status = 200
    var offline = false
    var membershipStatus: Int?
    private var denialCode = "not_a_member"
    private var malformed = false
    private var pause = false
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?

    init(payloads: [String: Data]) { self.payloads = payloads }
    func failOffline() { offline = true }
    func reject(_ status: Int, code: String = "not_a_member") {
        self.status = status
        denialCode = code
    }
    func makeMalformed() { malformed = true }
    func rejectMembership(_ status: Int) { membershipStatus = status }
    func pauseNext() { pause = true }
    func waitForRequest() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }
    func release() {
        response?.resume()
        response = nil
    }

    func membershipFailure(_ request: URLRequest) -> (Data, URLResponse)? {
        guard request.url?.path == "/v1/session", let membershipStatus else { return nil }
        return answer(request, status: membershipStatus, body: Data("{\"error\":{\"code\":\"not_a_member\"}}".utf8))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if offline { throw URLError(.notConnectedToInternet) }
        let status = status
        if pause {
            pause = false
            await withCheckedContinuation { continuation in
                response = continuation
                arrived = true
                waiter?.resume()
                waiter = nil
            }
        }
        let path = request.url!.lastPathComponent
        let key =
            path == "detail"
            ? URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first(where: {
                $0.name == "eventId"
            })?.value ?? ""
            : path
        let data =
            status == 200
            ? (malformed ? Data("{}".utf8) : payloads[key] ?? Data())
            : Data("{\"error\":{\"code\":\"\(denialCode)\"}}".utf8)
        return answer(request, status: status, body: data)
    }

    private func answer(_ request: URLRequest, status: Int, body: Data) -> (Data, URLResponse) {
        (body, HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}
