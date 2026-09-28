import Foundation
import XCTest

@testable import Nest

@MainActor
final class ProposalGenerationModelTests: XCTestCase {
    func testLostGenerationReplyPreservesReservationAndOperation() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: UUID(), accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: UUID(), household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = ProposalGenerationServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "proposal-generation-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            proposalAPI: MealProposalAPI(http: http))
        await model.restore()
        let context = try await model.cachedProposalContext()
        let week = MealWeekSnapshot(
            version: 1, householdId: member.householdId,
            weekStart: try MealWeekStart("2035-06-04"), revision: "0", entries: [])
        try await model.stageProposalGeneration(week: week, familiarOnly: false, context: context)
        do {
            _ = try await model.retryProposalGeneration(context)
            XCTFail("Expected lost generation response")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.cachedProposalContext()
        XCTAssertNotNil(pending.saved?.receipt)
        XCTAssertNil(pending.saved?.envelope)
        XCTAssertNotEqual(pending.saved?.rejected, true)
        let result = try await model.retryProposalGeneration(pending)
        XCTAssertEqual(result.saved?.envelope?.proposal.status, .ready)
        XCTAssertEqual(result.saved?.receipt?.proposalId, pending.saved?.receipt?.proposalId)
        XCTAssertEqual(result.saved?.command, pending.saved?.command)
        let calls = await server.calls
        XCTAssertEqual(calls.count, 2)
        XCTAssertEqual(calls.first, calls.last)
    }
}

actor ProposalGenerationServer {
    let member: VerifiedMember
    let proposalID = UUID()
    let entryID = UUID()
    var calls: [GenerateMealProposal] = []
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        let command = try JSONDecoder().decode(GenerateMealProposal.self, from: request.httpBody!)
        let receipt = MealProposalGenerationReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, proposalId: proposalID, revision: "1", weekStart: command.weekStart,
            expectedWeekRevision: command.expectedWeekRevision, familiarOnly: command.familiarOnly)
        let data: Data
        if request.url?.path == "/v1/meals/proposal/reserve" {
            struct Reserved: Encodable {
                let version = 1
                let receipt: MealProposalGenerationReceipt
            }
            data = try JSONEncoder().encode(Reserved(receipt: receipt))
        } else {
            XCTAssertEqual(request.url?.path, "/v1/meals/proposal/generate")
            calls.append(command)
            if calls.count == 1 { throw URLError(.networkConnectionLost) }
            let recipe = RecipeDraft(
                title: "Soup", servings: 2, instructions: "Simmer", recipeUrl: nil, notes: nil,
                ingredients: [.init(name: "Lentils", quantity: nil, unit: nil, categoryId: nil, note: nil)])
            let proposal = MealProposal(
                proposalId: proposalID, revision: "2", weekRevision: command.expectedWeekRevision,
                weekStart: command.weekStart, familiarOnly: false,
                entries: [
                    .init(
                        entryId: entryID, date: command.weekStart.date, slot: .dinner,
                        source: .suggested(recipe), estimatedCaloriesPerServing: nil)
                ],
                status: .ready, expiresAt: 2_100_000_000_000, failure: nil)
            struct Generated: Encodable {
                let version = 1
                let receipt: MealProposalGenerationReceipt
                let envelope: MealProposalEnvelope
            }
            data = try JSONEncoder().encode(
                Generated(
                    receipt: receipt,
                    envelope: .init(
                        version: 1, actorId: member.userId, householdId: member.householdId, proposal: proposal)))
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
