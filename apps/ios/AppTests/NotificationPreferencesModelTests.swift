import Foundation
import XCTest

@testable import Nest

@MainActor
final class NotificationPreferencesModelTests: XCTestCase {
    func testLostResponseReopensExactSaveWithoutImplicitOptIn() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = NotificationTestServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "notification-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            notificationAPI: NotificationAPI(http: http))
        await session.restore()
        XCTAssertEqual(session.status, .ready(member))
        let model = NotificationPreferencesModel()
        await model.load(session: session, member: member)
        XCTAssertNotNil(model.baseline)
        XCTAssertFalse(model.preferences.dailySummaryEnabled)
        XCTAssertFalse(model.preferences.itemRemindersEnabled)
        let initialSaves = await server.saves
        XCTAssertEqual(initialSaves, 0)
        model.preferences.dailySummaryEnabled = true
        model.preferences.dailySummaryTime = "07:30"
        await model.save(session: session, member: member)
        XCTAssertEqual(model.saved?.state, .pending)
        let command = try XCTUnwrap(model.saved?.command)
        await model.finish(session: session, member: member)
        XCTAssertEqual(model.saved?.state, .pending)
        let reopened = NotificationPreferencesModel()
        await reopened.load(session: session, member: member)
        XCTAssertEqual(reopened.saved?.command, command)
        await reopened.retry(session: session, member: member)
        XCTAssertEqual(reopened.saved?.state, .acknowledged)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await reopened.finish(session: session, member: member)
        XCTAssertNil(reopened.saved)
        XCTAssertEqual(reopened.baseline?.profile?.revision, "1")
        XCTAssertEqual(reopened.preferences.dailySummaryTime, "07:30")
        await server.changePreferences()
        reopened.preferences.dailySummaryTime = "06:00"
        await reopened.save(session: session, member: member)
        XCTAssertNil(reopened.saved, "Stale baseline must fail before staging a new operation")
        XCTAssertEqual(reopened.preferences.dailySummaryTime, "06:00", "Preserve the draft on rejection")
        let afterConflict = await server.saves
        XCTAssertEqual(afterConflict, 1)
    }
}

private actor NotificationTestServer {
    let member: VerifiedMember
    var profile: NotificationProfile?
    var command: SaveNotificationPreferences?
    var saves = 0
    init(member: VerifiedMember) { self.member = member }

    func changePreferences() {
        profile = .init(revision: "2", preferences: command!.preferences)
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/notification-preferences":
            data = try JSONEncoder().encode(
                NotificationProfileEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    timeZone: "Europe/Zurich", profile: profile))
        case "/v1/notification-preferences/save":
            let incoming = try JSONDecoder().decode(SaveNotificationPreferences.self, from: request.httpBody!)
            if let command {
                guard command == incoming else { throw NestAPIFailure.contract }
            } else {
                command = incoming
                profile = .init(revision: "1", preferences: incoming.preferences)
                saves += 1
                throw URLError(.networkConnectionLost)
            }
            let receipt = NotificationPreferenceReceipt(
                actorId: member.userId, householdId: member.householdId, operationId: incoming.operationId,
                revision: "1")
            struct Envelope: Encodable {
                let version = 1
                let receipt: NotificationPreferenceReceipt
            }
            data = try JSONEncoder().encode(Envelope(receipt: receipt))
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
