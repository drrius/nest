import Foundation
import XCTest

@testable import Nest

@MainActor
final class MoneyAccountTests: XCTestCase {
    func testDelayedFinancialReadsCannotReturnAfterSignOut() async throws {
        for route in 0..<3 { try await checkDelayedRead(route) }
    }

    func testDelayedFinancialReadsCannotReturnToAnotherMember() async throws {
        for route in 0..<3 { try await checkDelayedRead(route, switchAccount: true) }
    }

    private func checkDelayedRead(_ route: Int, switchAccount: Bool = false) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let eventId = UUID()
        let server = DelayedMoneyServer(data: try payload(route, member: member, partner: partner, eventId: eventId))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "money-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let generation = model.generation
        let request = Task {
            if route == 0 {
                _ = try await model.readMoneyBalance(member: member, generation: generation)
            } else if route == 1 {
                _ = try await model.readMoneyHistory(member: member, generation: generation, before: nil)
            } else {
                _ = try await model.readMoneyDetail(member: member, generation: generation, eventId: eventId)
            }
        }
        await server.waitForRequest()
        await model.signOut()
        if switchAccount { await model.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await server.release()
        do {
            try await request.value
            XCTFail("Returned old-account financial data")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        if switchAccount {
            XCTAssertEqual(
                model.status, .ready(.init(userId: partner, householdId: member.householdId, displayName: "Sam")))
        } else {
            XCTAssertEqual(model.status, .signedOut)
        }
    }

    private func payload(_ route: Int, member: VerifiedMember, partner: UUID, eventId: UUID) throws -> Data {
        let encoder = JSONEncoder()
        if route == 0 {
            return try encoder.encode(
                MoneyBalance(
                    version: 1, householdId: member.householdId, eventCount: "0",
                    openingEstablished: false,
                    members: [
                        .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("0")),
                        .init(actorId: partner, displayName: "Sam", centimes: try Centimes("0")),
                    ]))
        }
        if route == 1 {
            return try encoder.encode(
                MoneyHistory(
                    version: 1, householdId: member.householdId, before: nil,
                    next: nil, events: []))
        }
        let event = MoneyEventSummary(
            eventId: eventId, kind: .settlement, occurredOn: "2026-09-28",
            createdAt: "2026-09-28T00:00:00.000000Z", occurredOrder: "1", createdOrder: "1", description: "Fixture",
            amountCentimes: try Centimes("101"), createdBy: member.userId, payerId: member.userId,
            relatedEventId: nil, hasReceipt: false)
        return try encoder.encode(
            MoneyDetail(
                version: 1, householdId: member.householdId, event: event,
                receiptTotalCentimes: nil, note: nil, category: nil, reversedById: nil,
                shares: [
                    .init(memberId: member.userId, allocatedCentimes: nil, deltaCentimes: try Centimes("101")),
                    .init(memberId: partner, allocatedCentimes: nil, deltaCentimes: try Centimes("-101")),
                ]))
    }
}

private actor DelayedMoneyServer {
    let data: Data
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?
    init(data: Data) { self.data = data }

    func waitForRequest() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }

    func release() {
        response?.resume()
        response = nil
    }

    func respond(_ request: URLRequest) async -> (Data, URLResponse) {
        await withCheckedContinuation { continuation in
            response = continuation
            arrived = true
            waiter?.resume()
            waiter = nil
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
