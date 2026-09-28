import XCTest

@testable import NestCore

final class AssistantCancellationTests: XCTestCase {
    func testOnlyExactConfirmedCancellationCanClearPendingRequest() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "assistant-cancel-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "Hello")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.saveAssistantTurn(command, lease: lease)
        try await store.requestAssistantCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let saved = try await reopened.readAssistantTurn(lease: current)
        XCTAssertEqual(saved?.cancellationRequested, true)
        for (operation, cancelled) in [(UUID(), true), (command.operationId, false)] {
            let response = AssistantCancellation(
                version: 1, actorId: member.userId, householdId: member.householdId,
                conversationId: command.conversationId, operationId: operation, cancelled: cancelled)
            do {
                try await reopened.confirmAssistantCancellation(response, member: member, lease: current)
                XCTFail("Invalid cancellation erased request")
            } catch {}
        }
        let response = AssistantCancellation(
            version: 1, actorId: member.userId, householdId: member.householdId,
            conversationId: command.conversationId, operationId: command.operationId, cancelled: true)
        try await reopened.confirmAssistantCancellation(response, member: member, lease: current)
        let cleared = try await reopened.readAssistantTurn(lease: current)
        XCTAssertNil(cleared)
    }
}
