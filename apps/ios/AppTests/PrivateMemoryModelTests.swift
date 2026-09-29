import Foundation
import XCTest

@testable import Nest

@MainActor
final class PrivateMemoryModelTests: XCTestCase {
    func testLostProposalResponseRetainsIdentityAndRequiresExplicitSave() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = MemoryTestServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "memory-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            assistantAPI: AssistantAPI(http: http))
        await session.restore()
        let model = PrivateMemoryModel()
        await model.load(session: session, member: member)
        await model.propose(content: "Exact text", memory: nil, session: session, member: member)
        XCTAssertNotNil(model.saved)
        XCTAssertNil(model.saved?.response)
        let before = await server.decisions
        XCTAssertEqual(before, 0)
        let operation = model.saved?.request.operation
        let reopened = PrivateMemoryModel()
        await reopened.load(session: session, member: member)
        XCTAssertEqual(reopened.saved?.request.operation, operation)
        await reopened.retry(session: session, member: member)
        guard case .proposal(let result) = reopened.saved?.response else { return XCTFail("Missing proposal") }
        XCTAssertEqual(result.approval.change.content, "Exact text")
        let stillBefore = await server.decisions
        XCTAssertEqual(stillBefore, 0)
        await reopened.decide(true, session: session, member: member)
        guard case .decision(let result) = reopened.saved?.response else { return XCTFail("Missing decision") }
        XCTAssertEqual(result.decision.status, "consumed")
        let decisions = await server.decisions
        XCTAssertEqual(decisions, 1)
        await reopened.finish(session: session, member: member)
        XCTAssertNil(reopened.saved)
        XCTAssertEqual(reopened.memories.first?.content, "Exact text")
    }
}

private actor MemoryTestServer {
    let member: VerifiedMember
    var proposal: MemoryApproval?
    var loseResponse = true
    var decisions = 0
    var memories: [PrivateMemory] = []
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/memories":
            data = try JSONEncoder().encode(
                PrivateMemories(
                    version: 1, actorId: member.userId, householdId: member.householdId, memories: memories))
        case "/v1/memories/propose":
            let command = try JSONDecoder().decode(ProposeMemory.self, from: request.httpBody!)
            if let proposal {
                guard proposal.operationId == command.operationId, proposal.change == command.change else {
                    throw NestAPIFailure.contract
                }
            } else {
                proposal = MemoryApproval(
                    id: UUID(), operationId: command.operationId, change: command.change,
                    status: .pending, expiresAt: "2099-01-01T00:00:00Z")
            }
            if loseResponse {
                loseResponse = false
                throw URLError(.networkConnectionLost)
            }
            data = try JSONEncoder().encode(
                MemoryApprovalEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId, approval: proposal!))
        case "/v1/memories/decide":
            data = try decide(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func decide(_ request: URLRequest) throws -> Data {
        let command = try JSONDecoder().decode(DecideMemory.self, from: request.httpBody!)
        guard let proposal, command == DecideMemory(approval: proposal, approved: true) else {
            throw NestAPIFailure.contract
        }
        decisions += 1
        memories = [.init(id: command.memoryId, revision: "1", content: command.content)]
        let receipt = MemoryReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            memoryId: command.memoryId, revision: "1", removed: false)
        return try JSONEncoder().encode(
            MemoryDecisionEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                decision: .init(status: "consumed", receipt: receipt)))
    }
}
