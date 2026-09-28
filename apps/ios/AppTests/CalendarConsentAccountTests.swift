import Foundation
import XCTest

@testable import Nest

@MainActor
final class CalendarConsentAccountTests: XCTestCase {
    func testDelayedReceiptCannotReconcileAfterSignOut() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = DelayedConsentServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "consent-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store, calendarAPI: CalendarAPI(http: http))
        await model.restore()
        let context = try await model.calendarConsentContext()
        try await model.stageCalendarConsent(
            .init(incarnation: UUID(), version: "4", enabled: true), enabled: false, context: context)
        let request = Task { try await model.retryCalendarConsent(context) }
        await server.waitForRequest()
        await model.signOut()
        await server.release()
        do {
            _ = try await request.value
            XCTFail("Applied delayed old-account receipt")
        } catch OfflineFailure.sessionChanged {}
        XCTAssertEqual(model.status, .signedOut)
        let lease = try await store.activate(member)
        let retained = try await store.readCalendarConsentChange(lease: lease)
        XCTAssertNotNil(retained)
        XCTAssertEqual(retained?.conflict, false)
    }
}

private actor DelayedConsentServer {
    let member: VerifiedMember
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?
    init(member: VerifiedMember) { self.member = member }

    func waitForRequest() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }

    func release() {
        response?.resume()
        response = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(SetCalendarConsent.self, from: request.httpBody!)
        await withCheckedContinuation { continuation in
            response = continuation
            arrived = true
            waiter?.resume()
            waiter = nil
        }
        let receipt = CalendarConsentReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            consent: .init(incarnation: command.incarnation, version: "5", enabled: false))
        return (
            try JSONEncoder().encode(receipt),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
