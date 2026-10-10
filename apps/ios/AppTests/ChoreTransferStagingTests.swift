import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreTransferStagingTests: XCTestCase {
    func testSenderMustOwnCurrentOccurrenceAndRecipientMustOwnDecision() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let base = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let chore = NestChore(
            occurrenceId: UUID(), title: "Tidy", dueDate: try CivilDate("2026-09-28"),
            assigneeId: member.userId, offlineEpoch: nil)
        let snapshot = ChoreSnapshot(
            version: 1, householdId: member.householdId,
            members: [
                .init(actorId: member.userId, displayName: "Test"), .init(actorId: partner, displayName: "Partner"),
            ],
            transfers: [], chores: [chore])
        let body = try JSONEncoder().encode(snapshot)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url!.path == "/v1/chores/snapshot" {
                return (body, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
            }
            return try await base.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "handover-stage-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(auth: auth, chores: ChoreAPI(http: http), offline: try ChoreOfflineStore(url: url))
        await model.restore()
        let context = try model.routineCreateContext()
        let shared = NestChore(
            occurrenceId: chore.id, title: chore.title, dueDate: chore.dueDate, assigneeId: nil, offlineEpoch: nil)
        do {
            try await model.stageTransferRequest(shared, recipient: partner, context: context)
            XCTFail("Shared chore requested as owned")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        for recipient in [member.userId, UUID()] {
            do {
                try await model.stageTransferRequest(chore, recipient: recipient, context: context)
                XCTFail("Invalid recipient staged")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .invalid) }
        }
        let pending = PendingChoreTransfer(
            requestId: UUID(), occurrenceId: chore.id, dueDate: chore.dueDate,
            fromMemberId: member.userId, toMemberId: partner, title: chore.title)
        do {
            try await model.stageTransferResponse(pending, action: .accept, context: context)
            XCTFail("Sender accepted own request")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        let incoming = PendingChoreTransfer(
            requestId: UUID(), occurrenceId: chore.id, dueDate: chore.dueDate,
            fromMemberId: partner, toMemberId: member.userId, title: chore.title)
        do {
            try await model.stageTransferResponse(incoming, action: .decline, context: context)
            XCTFail("Missing incoming request staged")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let absent = try await model.savedChoreTransfer(context)
        XCTAssertNil(absent)
        try await model.stageTransferRequest(chore, recipient: partner, context: context)
        let saved = try await model.savedChoreTransfer(context)
        guard case .request(let command) = saved?.command else { return XCTFail("Request not retained") }
        XCTAssertEqual(command.occurrenceId, chore.id)
        XCTAssertEqual(command.recipientId, partner)
        XCTAssertEqual(command.expectedDueDate, chore.dueDate)
    }
}
