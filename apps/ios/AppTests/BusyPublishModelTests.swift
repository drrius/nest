import Foundation
import XCTest

@testable import Nest

@MainActor
final class BusyPublishModelTests: XCTestCase {
    func testRevokedConsentPreventsPublishRequest() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let incarnation = UUID()
        let server = RevokedBusyServer(member: member, incarnation: incarnation)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "busy-revoked-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            calendarAPI: CalendarAPI(http: http))
        await model.restore()
        let context = try await model.calendarConsentContext()
        let capture = BusyCapture(
            incarnation: incarnation, consent: "4", generation: "2",
            capturedAt: "2026-09-28T12:00:00Z", expiresAt: "2026-09-28T12:15:00Z")
        do {
            _ = try await model.publishCalendarCapture(
                context, capture: capture, projection: .init(covered: .init(start: 100, end: 200), intervals: []))
            XCTFail("Published after consent changed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let paths = await server.paths
        XCTAssertEqual(paths, ["/v1/calendar/consent"])
    }
}

private actor RevokedBusyServer {
    let member: VerifiedMember
    let incarnation: UUID
    var paths: [String] = []
    init(member: VerifiedMember, incarnation: UUID) {
        self.member = member
        self.incarnation = incarnation
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        paths.append(request.url!.path)
        let envelope = CalendarConsentEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            consent: .init(incarnation: incarnation, version: "5", enabled: false))
        return (
            try JSONEncoder().encode(envelope),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
