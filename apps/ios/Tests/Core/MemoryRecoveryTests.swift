import XCTest

@testable import NestCore

final class MemoryRecoveryTests: XCTestCase {
    func testRestartRetainsExactRequestAndProposalRequiresSeparateDecision() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = ProposeMemory(
            operationId: UUID(), memoryId: UUID(), expectedRevision: "0", content: "Exact private text")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.stageMemoryRequest(.proposal(command), lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let current = try await reopened.activate(member)
        let saved = try await reopened.readMemoryRequest(lease: current)
        guard case .proposal(let retained) = saved?.request else { return XCTFail("Lost request") }
        XCTAssertEqual(retained, command)
        do {
            try await reopened.finishMemoryRequest(operation: command.operationId, lease: current)
            XCTFail("Cleared uncertain request")
        } catch {}
        let approval = MemoryApproval(
            id: UUID(), operationId: command.operationId, change: command.change,
            status: .pending, expiresAt: "2099-01-01T00:00:00Z")
        let response = MemoryResponse.proposal(
            MemoryApprovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId, approval: approval))
        try await reopened.recordMemoryResponse(response, lease: current)
        do {
            try await reopened.finishMemoryRequest(operation: command.operationId, lease: current)
            XCTFail("Lost pending proposal")
        } catch {}
        try await reopened.decideSavedMemoryProposal(approved: false, lease: current)
        let decided = try await reopened.readMemoryRequest(lease: current)
        guard case .decision(let decision) = decided?.request else { return XCTFail("Missing separate decision") }
        XCTAssertFalse(decision.approved)
        XCTAssertEqual(decision.content, command.content)
        XCTAssertEqual(decision.operationId, command.operationId)
        let denied = MemoryResponse.decision(
            MemoryDecisionEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                decision: .init(status: "denied", receipt: nil)))
        try await reopened.recordMemoryResponse(denied, lease: current)
        try await reopened.finishMemoryRequest(operation: command.operationId, lease: current)
        let cleared = try await reopened.readMemoryRequest(lease: current)
        XCTAssertNil(cleared)
    }

    func testAnotherMemberCannotReadOrClearSavedRequest() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-scope-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        let command = RemoveMemory(operationId: UUID(), memoryId: UUID(), expectedRevision: "1")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.stageMemoryRequest(.removal(command), lease: lease)
        let partnerLease = try await store.activate(partner)
        let foreign = try await store.readMemoryRequest(lease: partnerLease)
        XCTAssertNil(foreign)
        do {
            _ = try await store.readMemoryRequest(lease: lease)
            XCTFail("Old lease remained active")
        } catch {}
        let current = try await store.activate(member)
        try await store.rejectMemoryRequest(operation: command.operationId, lease: current)
        try await store.finishMemoryRequest(operation: command.operationId, lease: current)
        let cleared = try await store.readMemoryRequest(lease: current)
        XCTAssertNil(cleared)
    }

    func testImportedProposalIsPrivateAndCannotReplacePendingIntent() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-import-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let approval = MemoryApproval(
            id: UUID(), operationId: UUID(),
            change: MemoryChange(memoryId: UUID(), expectedRevision: "0", content: "Review this"),
            status: .pending, expiresAt: "2099-01-01T00:00:00Z")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let foreign = MemoryApprovalEnvelope(
            version: 1, actorId: UUID(), householdId: member.householdId, approval: approval)
        do {
            try await store.importMemoryProposal(foreign, lease: lease)
            XCTFail("Imported another member's proposal")
        } catch {}
        let own = MemoryApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, approval: approval)
        try await store.importMemoryProposal(own, lease: lease)
        let saved = try await store.readMemoryRequest(lease: lease)
        XCTAssertEqual(saved?.approvalId, approval.id)
        guard case .proposal = saved?.request else { return XCTFail("Import implicitly decided") }
        do {
            try await store.importMemoryProposal(own, lease: lease)
            XCTFail("Replaced existing saved intent")
        } catch {}
    }

}
