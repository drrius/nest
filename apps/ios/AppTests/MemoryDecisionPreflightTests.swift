import Foundation
import XCTest

@testable import Nest

@MainActor
final class MemoryDecisionPreflightTests: XCTestCase {
    func testOfflineConsentKeepsOriginalProposalWithoutStagingDecision() async throws {
        for approved in [false, true] {
            let fixture = try await fixture(fault: .offline)
            do {
                try await fixture.session.decideSavedMemory(approved: approved, context: fixture.context)
                XCTFail("Staged new consent without a successful online approval read")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
            try await assertProposalRetained(fixture)
            let reads = await fixture.server.reads
            XCTAssertEqual(reads, 1)
        }
    }

    func testChangedExpiredOrForeignApprovalCannotReplaceSavedProposal() async throws {
        for fault in MemoryPreflightFault.allCases where fault != .none && fault != .offline {
            for approved in [false, true] {
                let fixture = try await fixture(fault: fault)
                do {
                    try await fixture.session.decideSavedMemory(approved: approved, context: fixture.context)
                    XCTFail("Staged consent for \(fault)")
                } catch {
                    XCTAssertEqual(
                        error as? NestAPIFailure,
                        [.actor, .household, .approvalId].contains(fault) ? .contract : .conflict)
                }
                try await assertProposalRetained(fixture)
            }
        }
    }

    func testFreshExactApprovalStagesOnlyChosenDecisionWithOriginalIdentity() async throws {
        for approved in [false, true] {
            for status in [MemoryApproval.Status.pending, .approved] {
                for deadline in [
                    "2099-01-01T00:00:00Z", "2099-01-01T00:00:00.123Z", "2099-01-01T00:00:00.123456+00:00",
                ] {
                    let fixture = try await fixture(status: status, deadline: deadline)
                    try await fixture.session.decideSavedMemory(approved: approved, context: fixture.context)
                    let saved = try await fixture.session.savedMemoryRequest(fixture.context)
                    guard case .decision(let command) = saved?.request else { return XCTFail("Missing decision") }
                    XCTAssertEqual(command, DecideMemory(approval: fixture.proposal.approval, approved: approved))
                    XCTAssertNil(saved?.response)
                    let reads = await fixture.server.reads
                    let writes = await fixture.server.writes
                    XCTAssertEqual(reads, 1)
                    XCTAssertEqual(writes, 0, "Staging is separate from sending the exact decision")
                }
            }
        }
    }

    func testLateApprovalReadCannotStageAfterSignOutOrMemberSwitch() async throws {
        for switchMember in [false, true] {
            for approved in [false, true] {
                let fixture = try await fixture()
                await fixture.server.pauseNextRead()
                let decision = Task {
                    try await fixture.session.decideSavedMemory(approved: approved, context: fixture.context)
                }
                await fixture.server.waitForRead()
                await fixture.session.signOut()
                if switchMember { await fixture.session.signIn(idToken: "B", nonce: "test") }
                await fixture.server.releaseRead()
                do {
                    try await decision.value
                    XCTFail("Staged a late decision for the original account")
                } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
                if switchMember {
                    let partner = try fixture.session.memoryContext()
                    let foreign = try await fixture.session.savedMemoryRequest(partner)
                    XCTAssertNil(foreign)
                }
                let originalLease = try await fixture.store.activate(fixture.member)
                let original = try await fixture.store.readMemoryRequest(lease: originalLease)
                guard case .proposal = original?.request else { return XCTFail("Original proposal changed") }
                XCTAssertEqual(original?.request.operation, fixture.proposal.approval.operationId)
            }
        }
    }

    func testReloadRefreshesCanonicalTerminalProposalAndExplicitlyClearsLocalSlot() async throws {
        for fault in [MemoryPreflightFault.denied, .consumed, .expired] {
            let fixture = try await fixture(fault: fault)
            let model = PrivateMemoryModel()
            await model.load(session: fixture.session, member: fixture.member)
            XCTAssertTrue(model.loaded)
            guard case .proposal(let current) = model.saved?.response else { return XCTFail("Lost proposal") }
            XCTAssertEqual(current.approval, fault.approval(fixture.proposal.approval))
            XCTAssertEqual(model.saved?.request.operation, fixture.proposal.approval.operationId)
            await model.finish(session: fixture.session, member: fixture.member)
            XCTAssertNil(model.saved)
            XCTAssertTrue(model.loaded)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0, "Explicit dismissal only clears this local confirmed proposal")
        }
    }

    func testFailedReloadKeepsExactProposalWithoutAcceptingChangedTerms() async throws {
        for fault in [MemoryPreflightFault.offline, .content, .approvalId, .actor] {
            let fixture = try await fixture(fault: fault)
            let model = PrivateMemoryModel()
            await model.load(session: fixture.session, member: fixture.member)
            XCTAssertFalse(model.loaded)
            XCTAssertNotNil(model.notice)
            guard case .proposal(let current) = model.saved?.response else { return XCTFail("Lost proposal") }
            XCTAssertEqual(current.approval, fixture.proposal.approval)
            try await assertProposalRetained(fixture)
        }
    }

    private func assertProposalRetained(_ fixture: MemoryPreflightFixture) async throws {
        let saved = try await fixture.session.savedMemoryRequest(fixture.context)
        guard case .proposal = saved?.request, case .proposal(let response) = saved?.response else {
            return XCTFail("A refused decision replaced the original pending proposal")
        }
        XCTAssertEqual(response.approval, fixture.proposal.approval)
        XCTAssertFalse(try XCTUnwrap(saved).rejected)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    private func fixture(
        fault: MemoryPreflightFault = .none, status: MemoryApproval.Status = .pending,
        deadline: String = "2099-01-01T00:00:00.123456+00:00"
    ) async throws -> MemoryPreflightFixture {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let approval = MemoryApproval(
            id: UUID(), operationId: UUID(),
            change: .init(memoryId: UUID(), expectedRevision: "0", content: "Exact private text"),
            status: status, expiresAt: deadline)
        let proposal = MemoryApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId, approval: approval)
        let server = MemoryPreflightServer(member: member, proposal: proposal, fault: fault)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-preflight-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store, assistantAPI: AssistantAPI(http: http))
        await session.restore()
        let context = try session.memoryContext()
        try await store.importMemoryProposal(proposal, lease: context.lease)
        return .init(
            member: member, session: session, store: store, context: context, proposal: proposal, server: server)
    }
}

private struct MemoryPreflightFixture {
    let member: VerifiedMember
    let session: SessionModel
    let store: ChoreOfflineStore
    let context: MemoryContext
    let proposal: MemoryApprovalEnvelope
    let server: MemoryPreflightServer
}

private enum MemoryPreflightFault: CaseIterable {
    case none, offline, denied, consumed, expired, content, operation, revision, actor, household, approvalId, memoryId

    func approval(_ original: MemoryApproval) -> MemoryApproval {
        .init(
            id: self == .approvalId ? UUID() : original.id,
            operationId: self == .operation ? UUID() : original.operationId,
            change: .init(
                memoryId: self == .memoryId ? UUID() : original.change.memoryId,
                expectedRevision: self == .revision ? "1" : original.change.expectedRevision,
                content: self == .content ? "Different text" : original.change.content),
            status: self == .denied ? .denied : self == .consumed ? .consumed : original.status,
            expiresAt: self == .expired ? "2000-01-01T00:00:00.000000+00:00" : original.expiresAt)
    }
}

private actor MemoryPreflightServer {
    let member: VerifiedMember
    let proposal: MemoryApprovalEnvelope
    let fault: MemoryPreflightFault
    var reads = 0
    var writes = 0
    private var paused = false
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember, proposal: MemoryApprovalEnvelope, fault: MemoryPreflightFault) {
        self.member = member
        self.proposal = proposal
        self.fault = fault
    }

    func pauseNextRead() { paused = true }

    func waitForRead() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }

    func releaseRead() {
        response?.resume()
        response = nil
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.httpMethod != "GET" {
            writes += 1
            throw NestAPIFailure.contract
        }
        if request.url?.path == "/v1/memories" {
            let memories = PrivateMemories(
                version: 1, actorId: member.userId, householdId: member.householdId, memories: [])
            return (
                try JSONEncoder().encode(memories),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        guard request.url?.path == "/v1/memories/approval",
            URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?.first?.value
                == proposal.approval.id.uuidString.lowercased(),
            request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "X-Nest-Household") == member.householdId.uuidString.lowercased(),
            request.cachePolicy == .reloadIgnoringLocalCacheData
        else { throw NestAPIFailure.contract }
        reads += 1
        if paused {
            await withCheckedContinuation { continuation in
                response = continuation
                arrived = true
                waiter?.resume()
                waiter = nil
            }
        }
        if fault == .offline { throw URLError(.notConnectedToInternet) }
        let envelope = MemoryApprovalEnvelope(
            version: 1, actorId: fault == .actor ? UUID() : member.userId,
            householdId: fault == .household ? UUID() : member.householdId, approval: fault.approval(proposal.approval))
        return (
            try JSONEncoder().encode(envelope),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
