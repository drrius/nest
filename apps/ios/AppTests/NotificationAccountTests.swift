import Foundation
import XCTest

@testable import Nest

@MainActor
final class NotificationAccountTests: XCTestCase {
    func testLateNotificationSaveCannotAcknowledgeAfterSignOutOrMemberSwitch() async throws {
        for switchAccount in [false, true] { try await checkLateSave(switchAccount: switchAccount) }
    }

    private func checkLateSave(switchAccount: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let command = SaveNotificationPreferences(
            operationId: UUID(), expectedRevision: "0",
            preferences: .init(dailySummaryEnabled: true, dailySummaryTime: "08:00", itemRemindersEnabled: false))
        let receipt = NotificationPreferenceReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId, revision: "1")
        struct Envelope: Encodable {
            let version = 1
            let receipt: NotificationPreferenceReceipt
        }
        let server = DelayedNotificationSave(data: try JSONEncoder().encode(Envelope(receipt: receipt)))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "notification-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            notificationAPI: NotificationAPI(http: http))
        await session.restore()
        let context = try session.notificationContext()
        try await store.stageNotificationRequest(
            .init(
                baseline: .init(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    timeZone: "Europe/Zurich", profile: nil),
                command: command, state: .pending, receipt: nil), lease: context.lease)
        let request = Task { try await session.retryNotificationPreferences(context) }
        await server.waitForRequest()
        await session.signOut()
        if switchAccount { await session.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await server.release()
        do {
            try await request.value
            XCTFail("Accepted late private notification receipt")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        if switchAccount {
            let foreign = try await session.savedNotificationRequest(session.notificationContext())
            XCTAssertNil(foreign)
        }
        let original = try await store.activate(member)
        let pending = try await store.readNotificationRequest(lease: original)
        XCTAssertEqual(pending?.command, command)
        XCTAssertEqual(pending?.state, .pending)
        XCTAssertNil(pending?.receipt)
    }
}

private actor DelayedNotificationSave {
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
