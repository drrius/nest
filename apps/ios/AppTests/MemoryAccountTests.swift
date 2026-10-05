import Foundation
import XCTest

@testable import Nest

@MainActor
final class MemoryAccountTests: XCTestCase {
    func testLateMemoryDecisionCannotAcknowledgeAfterSignOutOrAccountSwitch() async throws {
        for switchAccount in [false, true] { try await checkLateDecision(switchAccount: switchAccount) }
    }

    private func checkLateDecision(switchAccount: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let approval = MemoryApproval(
            id: UUID(), operationId: UUID(),
            change: MemoryChange(memoryId: UUID(), expectedRevision: "0", content: "Private memory"),
            status: .pending, expiresAt: "2099-01-01T00:00:00Z")
        let receipt = MemoryReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: approval.operationId,
            memoryId: approval.change.memoryId, revision: "1", removed: false)
        let result = MemoryDecisionEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            decision: .init(status: "consumed", receipt: receipt))
        let server = DelayedMemoryDecision(data: try JSONEncoder().encode(result))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-account-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store, assistantAPI: AssistantAPI(http: http))
        await session.restore()
        let context = try session.memoryContext()
        try await store.importMemoryProposal(
            .init(version: 1, actorId: member.userId, householdId: member.householdId, approval: approval),
            lease: context.lease)
        try await store.decideSavedMemoryProposal(
            approved: true,
            approval: .init(version: 1, actorId: member.userId, householdId: member.householdId, approval: approval),
            lease: context.lease)
        let request = Task { try await session.retryMemoryRequest(context) }
        await server.waitForRequest()
        await session.signOut()
        if switchAccount { await session.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await server.release()
        do {
            try await request.value
            XCTFail("Accepted a late private response")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        if switchAccount {
            let partnerContext = try session.memoryContext()
            let foreign = try await session.savedMemoryRequest(partnerContext)
            XCTAssertNil(foreign)
        }
        let originalLease = try await store.activate(member)
        let retained = try await store.readMemoryRequest(lease: originalLease)
        XCTAssertEqual(retained?.request.operation, approval.operationId)
        XCTAssertNil(retained?.response)
    }
}

private actor DelayedMemoryDecision {
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
