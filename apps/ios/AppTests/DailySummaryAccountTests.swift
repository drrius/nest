import Foundation
import XCTest

@testable import Nest

@MainActor
final class DailySummaryAccountTests: XCTestCase {
    func testLateLatestAndKnownSummaryReadsRejectSignOutAndMemberSwitch() async throws {
        for latest in [false, true] {
            for switchMember in [false, true] { try await checkRead(latest: latest, switchMember: switchMember) }
        }
    }

    private func checkRead(latest: Bool, switchMember: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let count = SummaryCount(count: 0, more: false)
        let value = DailySummarySnapshot(
            version: 1, summaryId: UUID(),
            summary: .init(
                version: 1, householdId: member.householdId, recipientId: member.userId,
                date: try CivilDate("2026-09-29"), choresDue: count, choresOverdue: count,
                mealsPlanned: count, renewalsDue: count, cancellationDeadlines: count))
        let data =
            latest
            ? try JSONEncoder().encode(
                LatestDailySummary(
                    version: 1, householdId: member.householdId, recipientId: member.userId, latest: value))
            : try JSONEncoder().encode(value)
        let server = DelayedSummaryRead(data: data)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "summary-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP),
            offline: try ChoreOfflineStore(url: url), notificationAPI: NotificationAPI(http: http))
        await session.restore()
        let context = try session.notificationContext()
        let request = Task {
            if latest {
                _ = try await session.readLatestSummary(context)
            } else {
                _ = try await session.readSummary(context, id: value.summaryId)
            }
        }
        await server.waitForRequest()
        await session.signOut()
        if switchMember { await session.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await server.release()
        do {
            try await request.value
            XCTFail("Accepted late private summary")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor DelayedSummaryRead {
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
