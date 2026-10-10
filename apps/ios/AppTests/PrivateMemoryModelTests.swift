import Foundation
import XCTest

@testable import Nest

@MainActor
final class PrivateMemoryModelTests: XCTestCase {
    func testLostProposalResponseRetainsIdentityAndRequiresExplicitSave() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
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
        XCTAssertEqual(session.status, .ready(member))
        let model = PrivateMemoryModel()
        await model.load(session: session, member: member)
        XCTAssertTrue(model.loaded)
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
        XCTAssertNil(reopened.saved?.response)
        XCTAssertEqual(reopened.saved?.request.operation, operation)
        await reopened.finish(session: session, member: member)
        XCTAssertNotNil(reopened.saved)
        await reopened.retry(session: session, member: member)
        guard case .decision(let result) = reopened.saved?.response else { return XCTFail("Missing decision") }
        XCTAssertEqual(result.decision.status, "consumed")
        XCTAssertEqual(reopened.memories.first?.content, "Exact text", "Confirmed save must refresh the visible list")
        let decisions = await server.decisions
        XCTAssertEqual(decisions, 1)
        await reopened.finish(session: session, member: member)
        XCTAssertNil(reopened.saved)
        XCTAssertEqual(reopened.memories.first?.content, "Exact text")
        let memory = try XCTUnwrap(reopened.memories.first)
        await reopened.remove(memory, session: session, member: member)
        XCTAssertNil(reopened.saved?.response)
        let removal = reopened.saved?.request.operation
        let recovered = PrivateMemoryModel()
        await recovered.load(session: session, member: member)
        XCTAssertEqual(recovered.saved?.request.operation, removal)
        await recovered.retry(session: session, member: member)
        guard case .removal = recovered.saved?.response else { return XCTFail("Missing removal receipt") }
        XCTAssertTrue(recovered.memories.isEmpty, "Confirmed removal must refresh before Done")
        await recovered.finish(session: session, member: member)
        XCTAssertNil(recovered.saved)
        XCTAssertTrue(recovered.memories.isEmpty)
    }
}

private actor MemoryTestServer {
    let member: VerifiedMember
    var proposal: MemoryApproval?
    var loseResponse = true
    var decisions = 0
    var loseDecision = true
    var loseRemoval = true
    var removedCommand: RemoveMemory?
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
        case "/v1/memories/approval":
            guard let proposal else { throw NestAPIFailure.contract }
            data = try JSONEncoder().encode(
                MemoryApprovalEnvelope(
                    version: 1, actorId: member.userId, householdId: member.householdId, approval: proposal))
        case "/v1/memories/decide":
            data = try decide(request)
        case "/v1/memories/remove":
            data = try remove(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func decide(_ request: URLRequest) throws -> Data {
        let command = try JSONDecoder().decode(DecideMemory.self, from: request.httpBody!)
        guard let proposal, command == DecideMemory(approval: proposal, approved: true) else {
            throw NestAPIFailure.contract
        }
        if loseDecision {
            decisions += 1
            memories = [.init(id: command.memoryId, revision: "1", content: command.content)]
            loseDecision = false
            throw URLError(.networkConnectionLost)
        }
        memories = [.init(id: command.memoryId, revision: "1", content: command.content)]
        let receipt = MemoryReceipt(
            actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
            memoryId: command.memoryId, revision: "1", removed: false)
        return try JSONEncoder().encode(
            MemoryDecisionEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                decision: .init(status: "consumed", receipt: receipt)))
    }

    private func remove(_ request: URLRequest) throws -> Data {
        let command = try JSONDecoder().decode(RemoveMemory.self, from: request.httpBody!)
        if let removedCommand {
            guard command == removedCommand else { throw NestAPIFailure.contract }
        } else {
            guard memories.contains(where: { $0.id == command.memoryId && $0.revision == command.expectedRevision })
            else { throw NestAPIFailure.contract }
            removedCommand = command
            memories = []
        }
        if loseRemoval {
            loseRemoval = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(
            MemoryRemovalEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId,
                receipt: MemoryReceipt(
                    actorId: member.userId, householdId: member.householdId, operationId: command.operationId,
                    memoryId: command.memoryId, revision: "2", removed: true)))
    }

}
