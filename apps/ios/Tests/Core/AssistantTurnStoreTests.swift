import Foundation
import XCTest

@testable import NestCore

final class AssistantTurnStoreTests: XCTestCase {
    func testRecoverySurvivesRestartAndCannotBeErasedOrReplacedBeforeTerminal() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "assistant-turn-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = StartAssistantTurn(
            conversationId: UUID(), operationId: UUID(), expectedRevision: "0", text: "What is due today?")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.saveAssistantTurn(command, lease: lease)
        do {
            try await store.finishAssistantTurn(operation: command.operationId, lease: lease)
            XCTFail("Uncertain turn erased")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        do {
            try await store.saveAssistantTurn(command, lease: lease)
            XCTFail("Uncertain turn replaced")
        } catch { XCTAssertEqual(error as? OfflineFailure, .alreadyQueued) }
        let reopened = try ChoreOfflineStore(url: url)
        let other = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        let otherLease = try await reopened.activate(other)
        let hidden = try await reopened.readAssistantTurn(lease: otherLease)
        XCTAssertNil(hidden)
        let current = try await reopened.activate(member)
        let saved = try await reopened.readAssistantTurn(lease: current)
        XCTAssertEqual(saved?.command, command)
        let assistant = UUID()
        func result(_ state: AssistantTurnReceipt.State, operation: UUID) -> AssistantTurnEnvelope {
            .init(
                version: 1, conversationId: command.conversationId, operationId: operation,
                turn: .init(
                    claimed: false, state: state, assistantId: assistant, inputRevision: "1",
                    finalRevision: state == .running ? nil : "2", deadline: "2099-01-01T00:00:00.000000Z"))
        }
        do {
            try await reopened.recordAssistantTurn(result(.completed, operation: UUID()), lease: current)
            XCTFail("Foreign operation accepted")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        try await reopened.recordAssistantTurn(result(.running, operation: command.operationId), lease: current)
        try await reopened.recordAssistantTurn(result(.completed, operation: command.operationId), lease: current)
        do {
            try await reopened.recordAssistantTurn(result(.running, operation: command.operationId), lease: current)
            XCTFail("Terminal result regressed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .invalidOperation) }
        try await reopened.finishAssistantTurn(operation: command.operationId, lease: current)
        let cleared = try await reopened.readAssistantTurn(lease: current)
        XCTAssertNil(cleared)
    }

    func testTurnInputUsesBackendUTF16LimitAndCanonicalRevision() {
        func command(_ text: String, revision: String = "0") -> StartAssistantTurn {
            .init(conversationId: UUID(), operationId: UUID(), expectedRevision: revision, text: text)
        }
        XCTAssertNoThrow(try command(String(repeating: "🌿", count: 1_000)).validated())
        XCTAssertThrowsError(try command(String(repeating: "🌿", count: 1_001)).validated())
        XCTAssertThrowsError(try command(" \n ").validated())
        XCTAssertThrowsError(try command("Hi", revision: "01").validated())
        XCTAssertThrowsError(try command("Hi", revision: "9223372036854775807").validated())
    }
}
