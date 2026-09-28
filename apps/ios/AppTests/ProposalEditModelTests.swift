import Foundation
import XCTest

@testable import Nest

@MainActor
final class ProposalEditModelTests: XCTestCase {
    func testLostEditReplyRetriesExactOperationAndReconciles() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = try ProposalEditServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "proposal-edit-\(UUID()).sqlite")
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
        let edit = MealProposalEditCommand(
            action: .replace, operationId: UUID(), proposalId: preview.proposal.id,
            expectedRevision: preview.proposal.revision, entryId: preview.proposal.entries![0].id,
            definitionId: nil, expectedLibraryRevision: nil)
        try await model.stageProposalEdit(edit, context: context)
        do {
            _ = try await model.retryProposalEdit(context)
            XCTFail("Expected lost response")
        } catch {}
        let pending = try await model.cachedProposalContext()
        XCTAssertEqual(pending.edit?.command, edit)
        let result = try await model.retryProposalEdit(pending)
        XCTAssertNil(result.edit)
        XCTAssertEqual(result.saved?.envelope?.proposal.revision, "3")
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
    }
}

actor ProposalEditServer {
    let preview: MealProposalEnvelope
    var calls: [MealProposalEditCommand] = []
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
        let p = preview.proposal
        let data: Data
        if request.url?.path == "/v1/meals/proposal/edit" {
            let command = try JSONDecoder().decode(MealProposalEditCommand.self, from: request.httpBody!)
            calls.append(command)
            if calls.count == 1 { throw URLError(.networkConnectionLost) }
            let receipt = MealProposalChangeReceipt(
                version: 1, actorId: preview.actorId, householdId: preview.householdId,
                operationId: command.operationId, proposalId: p.id, previousRevision: "2", revision: "3",
                entryId: command.entryId, action: .replace, definitionId: nil, expectedLibraryRevision: nil)
            data = try JSONEncoder().encode(
                MealProposalEdit(
                    version: 1, actorId: preview.actorId,
                    householdId: preview.householdId, command: command, expiresAt: p.expiresAt,
                    status: .applied, failure: nil, receipt: receipt))
        } else {
            let approved = MealProposal(
                proposalId: p.id, revision: "3", weekRevision: "0", weekStart: p.weekStart,
                familiarOnly: false, entries: p.entries, status: .ready, expiresAt: p.expiresAt, failure: nil)
            data = try JSONEncoder().encode(
                MealProposalEnvelope(
                    version: 1, actorId: preview.actorId,
                    householdId: preview.householdId, proposal: approved))
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
