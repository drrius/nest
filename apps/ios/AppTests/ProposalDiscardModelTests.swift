import Foundation
import XCTest

@testable import Nest

@MainActor
final class ProposalDiscardModelTests: XCTestCase {
    func testLostDiscardReplyRetriesExactOperationAndReconciles() async throws {
        try await verify()
    }

    func testOfflineOrChangedPreviewCannotStageNewDiscard() async throws {
        for fault in ["offline", "changed"] { try await verify(fault: fault) }
    }

    private func verify(fault: String? = nil) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = try ProposalDiscardServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "proposal-discard-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            proposalAPI: MealProposalAPI(http: http))
        await model.restore()
        let lease = try XCTUnwrap(model.lease)
        let preview = await server.preview
        let command = GenerateMealProposal(
            operationId: UUID(), weekStart: preview.proposal.weekStart,
            expectedWeekRevision: "0", familiarOnly: false)
        try await store.enqueueProposalGeneration(command, lease: lease)
        try await store.reserveProposalGeneration(
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, proposalId: preview.proposal.id, revision: "1",
                weekStart: command.weekStart,
                expectedWeekRevision: "0", familiarOnly: false), lease: lease)
        try await store.saveGeneratedProposal(preview, lease: lease)
        let context = try await model.cachedProposalContext()
        if let fault {
            await server.setFault(fault)
            do {
                try await model.stageProposalDiscard(context)
                XCTFail("A cached or changed preview staged a new operation")
            } catch {}
            let refused = try await model.cachedProposalContext()
            XCTAssertNil(refused.discard)
            XCTAssertEqual(refused.saved?.envelope, preview)
            let calls = await server.calls
            XCTAssertTrue(calls.isEmpty)
            return
        }
        try await model.stageProposalDiscard(context)
        do {
            _ = try await model.retryProposalDiscard(context)
            XCTFail("Expected lost response")
        } catch {}
        let pending = try await model.cachedProposalContext()
        XCTAssertEqual(pending.discard?.state, .pending)
        let result = try await model.retryProposalDiscard(pending)
        XCTAssertNil(result.discard)
        XCTAssertEqual(result.saved?.envelope?.proposal.status, .discarded)
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
    }
}

actor ProposalDiscardServer {
    let preview: MealProposalEnvelope
    private var fault: String?
    func setFault(_ value: String) { fault = value }
    var calls: [DiscardMealProposal] = []
    init(member: VerifiedMember) throws {
        let week = try MealWeekStart("2035-06-04")
        let recipe = RecipeDraft(
            title: "Soup", servings: 2, instructions: "Simmer", recipeUrl: nil, notes: nil,
            ingredients: [.init(name: "Lentils", quantity: nil, unit: nil, categoryId: nil, note: nil)])
        preview = .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            proposal: .init(
                proposalId: UUID(), revision: "2", weekRevision: "0", weekStart: week, familiarOnly: false,
                entries: [
                    .init(
                        entryId: UUID(), date: week.date, slot: .dinner, source: .suggested(recipe),
                        estimatedCaloriesPerServing: nil)
                ], status: .ready, expiresAt: 2_100_000_000_000, failure: nil))
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if fault == "offline" { throw URLError(.notConnectedToInternet) }
        let p = preview.proposal
        let data: Data
        if request.url?.path == "/v1/meals/proposal/discard" {
            let command = try JSONDecoder().decode(DiscardMealProposal.self, from: request.httpBody!)
            calls.append(command)
            if calls.count == 1 { throw URLError(.networkConnectionLost) }
            let receipt = MealProposalDiscardReceipt(
                version: 1, actorId: preview.actorId, householdId: preview.householdId,
                operationId: command.operationId, proposalId: p.id, previousRevision: "2", revision: "3")
            struct Response: Encodable {
                let version = 1
                let receipt: MealProposalDiscardReceipt
            }
            data = try JSONEncoder().encode(Response(receipt: receipt))
        } else {
            let approved = MealProposal(
                proposalId: p.id, revision: calls.isEmpty && fault != "changed" ? "2" : "3", weekRevision: "0",
                weekStart: p.weekStart,
                familiarOnly: false, entries: p.entries, status: calls.isEmpty ? .ready : .discarded,
                expiresAt: p.expiresAt, failure: nil)
            data = try JSONEncoder().encode(
                MealProposalEnvelope(
                    version: 1, actorId: preview.actorId,
                    householdId: preview.householdId, proposal: approved))
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
