import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantAccountTests: XCTestCase {
    func testDelayedAssistantReadsCannotReturnAfterSignOut() async throws {
        for route in 0..<5 { try await checkDelayedRead(route) }
    }

    func testDelayedAssistantReadsCannotReturnToAnotherMember() async throws {
        for route in 0..<5 { try await checkDelayedRead(route, switchAccount: true) }
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
        let server = DelayedAssistantServer(
            data: try payload(route, member: member, partner: partner, eventId: eventId))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "assistant-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            assistantAPI: AssistantAPI(http: http))
        await model.restore()
        let context = try model.assistantContext()
        let turnContext = try model.assistantTurnContext()
        let request = Task {
            if route == 0 {
                _ = try await model.readConversations(context, after: nil)
            } else if route == 1 {
                _ = try await model.readConversation(context, id: eventId)
            } else if route == 3 {
                _ = try await model.readMemories(context)
            } else if route == 4 {
                _ = try await model.readMemoryApproval(context, id: eventId)
            } else {
                try await model.stageAssistantTurn(
                    .init(conversationId: eventId, operationId: UUID(), expectedRevision: "1", text: "Hello"),
                    context: turnContext)
            }
        }
        await server.waitForRequest()
        await model.signOut()
        if switchAccount { await model.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await server.release()
        do {
            try await request.value
            XCTFail("Returned old-account private conversation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        if switchAccount {
            XCTAssertEqual(
                model.status, .ready(.init(userId: partner, householdId: member.householdId, displayName: "Sam")))
        } else {
            XCTAssertEqual(model.status, .signedOut)
        }
    }

    private func payload(_ route: Int, member: VerifiedMember, partner: UUID, eventId: UUID) throws -> Data {
        if route == 3 {
            return try JSONEncoder().encode(
                PrivateMemories(version: 1, actorId: member.userId, householdId: member.householdId, memories: []))
        }
        if route == 4 {
            return try JSONEncoder().encode(
                MemoryApprovalEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    approval: MemoryApproval(
                        id: eventId, operationId: UUID(),
                        change: MemoryChange(memoryId: UUID(), expectedRevision: "0", content: "Private memory"),
                        status: .pending, expiresAt: "2099-01-01T00:00:00Z")))
        }
        if route == 2 {
            return Data(
                "{\"version\":1,\"actorId\":\"\(member.userId)\",\"householdId\":\"\(member.householdId)\",\"available\":true}"
                    .utf8)
        }
        if route == 0 {
            return try JSONEncoder().encode(
                AssistantConversationPage(
                    version: 1, actorId: member.userId, householdId: member.householdId,
                    conversations: [], nextCursor: nil))
        }
        return Data(
            """
            {"version":1,"conversation":{"conversationId":"\(eventId)","revision":"1","messages":[
              {"id":"message","role":"assistant","parts":[{"type":"text","text":"Private reply"}]}]}}
            """.utf8)
    }
}

private actor DelayedAssistantServer {
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
