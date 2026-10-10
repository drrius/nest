import Foundation
import XCTest

@testable import Nest

@MainActor
final class AssistantComposerTests: XCTestCase {
    func testOfflineSendRetainsDraftWithoutCreatingRecoveryRecord() async throws {
        let (session, _) = try await fixture()
        let composer = AssistantComposerModel()
        composer.text = "What is due today?"
        await composer.send(session: session, conversation: UUID())
        XCTAssertEqual(composer.text, "What is due today?")
        XCTAssertNil(composer.saved)
        XCTAssertFalse(composer.busy)
        XCTAssertNotNil(composer.notice)
        let saved = try await session.savedAssistantTurn(session.assistantTurnContext())
        XCTAssertNil(saved)
    }

    func testReopenedComposerRetainsUnconfirmedIdentityAndCannotAcknowledgeIt() async throws {
        let (session, store) = try await fixture()
        let context = try session.assistantTurnContext()
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "Hello")
        try await store.saveAssistantTurn(command, lease: context.lease)
        let composer = AssistantComposerModel()
        await composer.load(session: session)
        XCTAssertEqual(composer.saved?.command, command)
        await composer.acknowledge(session: session)
        await composer.recover(session: session)
        XCTAssertEqual(composer.saved?.command, command)
        XCTAssertNotNil(composer.notice)
        await session.signOut()
        await composer.load(session: session)
        XCTAssertNil(composer.saved)
        XCTAssertEqual(composer.reply, "")
    }

    func testDisabledAssistantKeepsUnsentDraftWithoutRecoveryRecord() async throws {
        let (session, _) = try await fixture(disabled: true)
        let composer = AssistantComposerModel()
        composer.text = "Hello"
        await composer.send(session: session, conversation: UUID())
        XCTAssertEqual(composer.text, "Hello")
        XCTAssertNil(composer.saved)
        XCTAssertEqual(composer.notice, "Nest’s assistant is not available yet. Your message has not been sent.")
        let saved = try await session.savedAssistantTurn(session.assistantTurnContext())
        XCTAssertNil(saved)
    }

    private func fixture(disabled: Bool = false) async throws -> (SessionModel, ChoreOfflineStore) {
        let actor = UUID()
        let partner = UUID()
        let household = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: actor, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let offlineHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            guard disabled else { throw URLError(.notConnectedToInternet) }
            let body =
                request.url?.path.hasSuffix("availability") == true
                ? "{\"version\":1,\"actorId\":\"\(actor)\",\"householdId\":\"\(household)\",\"available\":false}"
                : "{\"version\":1,\"conversation\":null}"
            return (
                Data(body.utf8),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "assistant-composer-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            assistantAPI: AssistantAPI(http: offlineHTTP))
        await session.restore()
        return (session, store)
    }
}
