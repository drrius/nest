import Foundation
import XCTest

@testable import Nest

@MainActor
final class CalendarConsentModelTests: XCTestCase {
    func testPermissionLossRetainsLostOptOutUntilRetry() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = ConsentRetryServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "consent-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            calendarAPI: CalendarAPI(http: http))
        await model.restore()
        let context = try await model.calendarConsentContext()
        let untouched = try await model.revokeCalendarConsentAfterPermissionLoss(
            access: .notRequested, context: context)
        XCTAssertNil(untouched)
        do {
            _ = try await model.revokeCalendarConsentAfterPermissionLoss(access: .denied, context: context)
            XCTFail("Expected lost response")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.calendarConsentContext()
        XCTAssertEqual(pending.removal?.command?.enabled, false)
        XCTAssertNil(pending.pending)
        let retried = try await model.revokeCalendarConsentAfterPermissionLoss(access: .allowed, context: pending)
        let result = try XCTUnwrap(retried)
        XCTAssertFalse(result.enabled)
        XCTAssertEqual(result.version, "5")
        let finished = try await model.calendarConsentContext()
        XCTAssertNil(finished.pending)
        XCTAssertNil(finished.removal)
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
        await model.signOut()
        do {
            _ = try await model.readCalendarConsent(context)
            XCTFail("Used old account context")
        } catch OfflineFailure.sessionChanged {}
    }
}

private actor ConsentRetryServer {
    let member: VerifiedMember
    let incarnation = UUID()
    var calls: [SetCalendarConsent] = []
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/calendar/consent" {
            let value = CalendarConsentEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                consent: .init(incarnation: incarnation, version: "4", enabled: true))
            return (
                try JSONEncoder().encode(value),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        XCTAssertEqual(request.url?.path, "/v1/calendar/consent/set")
        let command = try JSONDecoder().decode(SetCalendarConsent.self, from: request.httpBody!)
        calls.append(command)
        if calls.count == 1 { throw URLError(.networkConnectionLost) }
        let receipt = CalendarConsentReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            consent: .init(incarnation: command.incarnation, version: "5", enabled: command.enabled))
        return (
            try JSONEncoder().encode(receipt),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
