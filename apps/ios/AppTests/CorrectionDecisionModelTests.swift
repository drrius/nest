import Foundation
import XCTest

@testable import Nest

@MainActor
final class CorrectionDecisionModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyRecovery(expired: false)
    }

    func testExpiredApprovalFinishesWithoutSubmittingDecision() async throws {
        try await verifyRecovery(expired: true)
    }

    private func verifyRecovery(expired: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostCorrectionDecisionReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "correction-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let expense = ExpenseInput(
            description: "Replacement", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let correction = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: .expense(expense))
        let input = CorrectionDecision(operationId: UUID(), approvalId: UUID(), correction: correction, approved: true)
        await server.prepare(input, expired: expired)
        try await model.stageCorrectionDecision(input, context: context)
        let staged = try await model.savedCorrectionDecision(context)
        if expired {
            let recovered = try await model.retryCorrectionDecision(context)
            XCTAssertTrue(recovered.isTerminal)
            XCTAssertTrue(recovered.expiry?.expiredUnused == true)
            XCTAssertEqual(recovered.decision, input)
            let replay = try await model.retryCorrectionDecision(context)
            XCTAssertTrue(replay.expiry?.expiredUnused == true)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            try await model.finishCorrectionDecision(context, approvalId: input.approvalId)
            let cleared = try await model.savedCorrectionDecision(context)
            XCTAssertNil(cleared)
            return
        }
        do {
            _ = try await model.retryCorrectionDecision(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedCorrectionDecision(context)
        XCTAssertEqual(pending?.decision, staged?.decision)
        XCTAssertNil(pending?.result?.approval.receipt)
        let recovered = try await model.retryCorrectionDecision(context)
        XCTAssertEqual(recovered.result?.approval.status, .consumed)
        XCTAssertEqual(recovered.decision, staged?.decision)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryCorrectionDecision(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor LostCorrectionDecisionReplyServer {
    let member: VerifiedMember
    var decision: CorrectionDecision?
    var receipt: CorrectionReceipt?
    var saves = 0
    var expired = false
    init(member: VerifiedMember) { self.member = member }
    func prepare(_ value: CorrectionDecision, expired: Bool) {
        decision = value
        self.expired = expired
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url!.path.hasSuffix("/decide") {
            let input = try JSONDecoder().decode(CorrectionDecision.self, from: request.httpBody!)
            guard input == decision else { throw NestAPIFailure.contract }
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, approvalId: input.approvalId, reversalEventId: UUID(),
                replacementEventId: UUID(),
                correction: input.correction)
            throw URLError(.networkConnectionLost)
        }
        guard let decision else { throw NestAPIFailure.contract }
        if request.url!.path.hasSuffix("/approval-expiry") {
            let result = FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId, command: .correction,
                expiredUnused: expired, checkedAt: "2026-09-28T08:00:00.000000Z")
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let result = CorrectionApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: decision.approvalId, operationId: decision.operationId, correction: decision.correction,
                status: receipt == nil ? .pending : .consumed,
                expiresAt: expired ? "2026-09-28T07:00:00.000000Z" : "2099-01-01T00:00:00.000000Z",
                receipt: receipt))
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
