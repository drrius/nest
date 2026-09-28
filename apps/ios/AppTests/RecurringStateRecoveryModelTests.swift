import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringStateRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostRecurringStateReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "change-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let input = RecurringStateInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: .active, action: .pause)
        try await model.stageRecurringState(input, context: context)
        let staged = try await model.savedRecurringState(context)
        do {
            _ = try await model.retryRecurringState(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedRecurringState(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        let recovered = try await model.retryRecurringState(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryRecurringState(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor LostRecurringStateReplyServer {
    let member: VerifiedMember
    var receipt: RecurringStateReceipt?
    var saves = 0
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveRecurringState.self, from: request.httpBody!)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, revision: UUID(),
                status: .paused, change: command.change)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = RecurringStateRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
