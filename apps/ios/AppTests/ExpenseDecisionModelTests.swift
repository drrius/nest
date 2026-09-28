import Foundation
import XCTest

@testable import Nest

@MainActor
final class ExpenseDecisionModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostDecisionReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "refund-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner)
        let expense = ExpenseInput(
            description: "Approval fixture", amountCentimes: try Centimes("101"),
            receiptPath: nil, receiptTotalCentimes: nil, payerId: member.userId, allocations: shares,
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let input = ExpenseDecision(operationId: UUID(), approvalId: UUID(), expense: expense, approved: true)
        await server.prepare(input)
        try await model.stageExpenseDecision(input, context: context)
        let staged = try await model.savedExpenseDecision(context)
        do {
            _ = try await model.retryExpenseDecision(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedExpenseDecision(context)
        XCTAssertEqual(pending?.decision, staged?.decision)
        XCTAssertNil(pending?.result?.approval.receipt)
        let recovered = try await model.retryExpenseDecision(context)
        XCTAssertEqual(recovered.result?.approval.status, .consumed)
        XCTAssertEqual(recovered.decision, staged?.decision)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryExpenseDecision(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor LostDecisionReplyServer {
    let member: VerifiedMember
    var decision: ExpenseDecision?
    var receipt: ExpenseReceipt?
    var saves = 0
    init(member: VerifiedMember) { self.member = member }
    func prepare(_ value: ExpenseDecision) { decision = value }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url!.path.hasSuffix("/decide") {
            let input = try JSONDecoder().decode(ExpenseDecision.self, from: request.httpBody!)
            guard input == decision else { throw NestAPIFailure.contract }
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, eventId: UUID(), approvalId: input.approvalId, expense: input.expense)
            throw URLError(.networkConnectionLost)
        }
        guard let decision else { throw NestAPIFailure.contract }
        let result = ExpenseApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, expense: decision.expense,
                status: receipt == nil ? .pending : .consumed, expiresAt: "2099-01-01T00:00:00.000000Z",
                receipt: receipt))
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
