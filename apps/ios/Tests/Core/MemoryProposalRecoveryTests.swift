import XCTest

@testable import NestCore

final class MemoryProposalRecoveryTests: XCTestCase {
    func testOnlyConfirmedExpiredOrTerminalProposalCanBeDismissed() async throws {
        for status in [MemoryApproval.Status.pending, .approved, .denied, .consumed] {
            for expired in [false, true] {
                let fixture = try await fixture(status: status, expired: expired)
                let mayFinish = expired || [.denied, .consumed].contains(status)
                do {
                    try await fixture.store.finishMemoryRequest(
                        operation: fixture.envelope.approval.operationId, lease: fixture.lease)
                    XCTAssertTrue(mayFinish, "Discarded an active undecided proposal")
                } catch { XCTAssertFalse(mayFinish) }
                let retained = try await fixture.store.readMemoryRequest(lease: fixture.lease)
                XCTAssertEqual(retained == nil, mayFinish)
            }
        }
    }

    func testRefreshRetainsCommandAndOnlyReplacesCanonicalStatus() async throws {
        for status in [MemoryApproval.Status.denied, .consumed] {
            let fixture = try await fixture()
            let updated = fixture.envelope(status: status)
            try await fixture.store.refreshMemoryProposal(updated, lease: fixture.lease)
            let reopened = try ChoreOfflineStore(url: fixture.url)
            let lease = try await reopened.activate(fixture.member)
            let retained = try await reopened.readMemoryRequest(lease: lease)
            guard case .proposal(let command) = retained?.request,
                case .proposal(let response) = retained?.response
            else { return XCTFail("Refresh changed the saved command kind") }
            XCTAssertEqual(command.change, fixture.envelope.approval.change)
            XCTAssertEqual(command.operationId, fixture.envelope.approval.operationId)
            XCTAssertEqual(response.approval, updated.approval)
            try await reopened.finishMemoryRequest(operation: command.operationId, lease: lease)
            let cleared = try await reopened.readMemoryRequest(lease: lease)
            XCTAssertNil(cleared)
        }
    }

    func testForeignOrDifferentProposalCannotRefreshOrStageConsent() async throws {
        for fault in MemoryRefreshFault.allCases {
            let fixture = try await fixture()
            let foreign = fixture.envelope(fault: fault)
            do {
                try await fixture.store.refreshMemoryProposal(foreign, lease: fixture.lease)
                XCTFail("Refreshed mismatched \(fault)")
            } catch {}
            for approved in [true, false] {
                do {
                    try await fixture.store.decideSavedMemoryProposal(
                        approved: approved, approval: foreign, lease: fixture.lease)
                    XCTFail("Staged mismatched \(fault)")
                } catch {}
            }
            let retained = try await fixture.store.readMemoryRequest(lease: fixture.lease)
            guard case .proposal(let response) = retained?.response else { return XCTFail("Lost original") }
            XCTAssertEqual(response.approval, fixture.envelope.approval)
        }
    }

    func testExpiredDecisionStillRequiresItsOwnConfirmedResult() async throws {
        let fixture = try await fixture()
        try await fixture.store.decideSavedMemoryProposal(
            approved: true, approval: fixture.envelope, lease: fixture.lease)
        let expired = fixture.envelope(expired: true)
        do {
            try await fixture.store.refreshMemoryProposal(expired, lease: fixture.lease)
            XCTFail("Replaced an uncertain decision with a proposal")
        } catch {}
        do {
            try await fixture.store.finishMemoryRequest(
                operation: fixture.envelope.approval.operationId, lease: fixture.lease)
            XCTFail("Discarded an uncertain decision")
        } catch {}
        let retained = try await fixture.store.readMemoryRequest(lease: fixture.lease)
        guard case .decision(let command) = retained?.request else { return XCTFail("Lost chosen decision") }
        XCTAssertEqual(command, DecideMemory(approval: fixture.envelope.approval, approved: true))
        XCTAssertNil(retained?.response)
    }

    func testExpiryCannotGrantConsentAndAnotherAccountCannotDiscardProposal() async throws {
        let fixture = try await fixture(expired: true)
        do {
            try await fixture.store.decideSavedMemoryProposal(
                approved: true, approval: fixture.envelope, lease: fixture.lease)
            XCTFail("Staged an expired proposal")
        } catch {}
        let partner = VerifiedMember(
            userId: UUID(), householdId: fixture.member.householdId, displayName: "Partner")
        let partnerLease = try await fixture.store.activate(partner)
        do {
            try await fixture.store.finishMemoryRequest(
                operation: fixture.envelope.approval.operationId, lease: partnerLease)
            XCTFail("Cleared another member's expired proposal")
        } catch {}
        do {
            try await fixture.store.refreshMemoryProposal(fixture.envelope, lease: fixture.lease)
            XCTFail("Used an obsolete lease")
        } catch {}
        let lease = try await fixture.store.activate(fixture.member)
        let retained = try await fixture.store.readMemoryRequest(lease: lease)
        guard case .proposal(let response) = retained?.response else { return XCTFail("Lost own proposal") }
        XCTAssertEqual(response.approval, fixture.envelope.approval)
    }

    private func fixture(
        status: MemoryApproval.Status = .pending, expired: Bool = false
    ) async throws -> MemoryRefreshFixture {
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-refresh-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let envelope = MemoryApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: UUID(), operationId: UUID(),
                change: .init(memoryId: UUID(), expectedRevision: "0", content: "Original private text"),
                status: status,
                expiresAt: expired ? "2000-01-01T00:00:00.123456+00:00" : "2099-01-01T00:00:00.123456+00:00"))
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        try await store.importMemoryProposal(envelope, lease: lease)
        return .init(url: url, member: member, envelope: envelope, store: store, lease: lease)
    }
}

private enum MemoryRefreshFault: CaseIterable {
    case actor, household, approvalId, operation, memoryId, revision, content
}

private struct MemoryRefreshFixture {
    let url: URL
    let member: VerifiedMember
    let envelope: MemoryApprovalEnvelope
    let store: ChoreOfflineStore
    let lease: OfflineLease

    func envelope(
        status: MemoryApproval.Status = .pending, expired: Bool = false, fault: MemoryRefreshFault? = nil
    ) -> MemoryApprovalEnvelope {
        let original = envelope.approval
        return .init(
            version: 1, actorId: fault == .actor ? UUID() : member.userId,
            householdId: fault == .household ? UUID() : member.householdId,
            approval: .init(
                id: fault == .approvalId ? UUID() : original.id,
                operationId: fault == .operation ? UUID() : original.operationId,
                change: .init(
                    memoryId: fault == .memoryId ? UUID() : original.change.memoryId,
                    expectedRevision: fault == .revision ? "1" : original.change.expectedRevision,
                    content: fault == .content ? "Changed private text" : original.change.content),
                status: status, expiresAt: expired ? "2000-01-01T00:00:00Z" : original.expiresAt))
    }
}
