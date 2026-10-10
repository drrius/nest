import Foundation
import XCTest

@testable import Nest

@MainActor
final class ExpenseDecisionModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyRecovery(expired: false)
    }

    func testExpiredApprovalFinishesWithoutSubmittingDecision() async throws {
        try await verifyRecovery(expired: true)
    }

    func testNewDecisionRequiresFreshOnlineUnexpiredExactPrivateProposal() async throws {
        for approved in [true, false] {
            for fault in ["offline", "expired", "operation", "actor", "denied"] {
                try await verifyRecovery(expired: false, preflightFault: fault, approved: approved)
            }
        }
    }

    func testDelayedPreflightCannotJournalAfterSignOutOrMemberSwitch() async throws {
        for fault in ["signout", "switch"] {
            try await verifyRecovery(expired: false, preflightFault: fault)
        }
    }

    private func verifyRecovery(
        expired: Bool, preflightFault: String? = nil, approved: Bool = true
    ) async throws {
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
        let input = ExpenseDecision(operationId: UUID(), approvalId: UUID(), expense: expense, approved: approved)
        await server.prepare(input, expired: false)
        if let preflightFault {
            await server.failPreflight(preflightFault)
            try await verifyRefusedPreflight(
                model, context: context, input: input, server: server, fault: preflightFault)
            return
        }
        try await model.stageExpenseDecision(input, context: context)
        if expired { await server.prepare(input, expired: true) }
        let staged = try await model.savedExpenseDecision(context)
        if expired {
            let recovered = try await model.retryExpenseDecision(context)
            XCTAssertTrue(recovered.isTerminal)
            XCTAssertTrue(recovered.expiry?.expiredUnused == true)
            XCTAssertEqual(recovered.decision, input)
            let replay = try await model.retryExpenseDecision(context)
            XCTAssertTrue(replay.expiry?.expiredUnused == true)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            try await model.finishExpenseDecision(context, approvalId: input.approvalId)
            let cleared = try await model.savedExpenseDecision(context)
            XCTAssertNil(cleared)
            return
        }
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
    private func verifyRefusedPreflight(
        _ model: SessionModel, context: ExpenseContext, input: ExpenseDecision,
        server: LostDecisionReplyServer, fault: String
    ) async throws {
        if ["signout", "switch"].contains(fault) {
            try await verifyInterruptedPreflight(
                model, context: context, input: input, server: server, fault: fault)
            return
        }
        do {
            try await model.stageExpenseDecision(input, context: context)
            XCTFail("A new financial decision was journaled without valid online preflight")
        } catch {}
        let saved = try await model.savedExpenseDecision(context)
        XCTAssertNil(saved)
        let sends = await server.saves
        XCTAssertEqual(sends, 0)
    }

    private func verifyInterruptedPreflight(
        _ model: SessionModel, context: ExpenseContext, input: ExpenseDecision,
        server: LostDecisionReplyServer, fault: String
    ) async throws {
        await server.pauseNextRead()
        let staging = Task { try await model.stageExpenseDecision(input, context: context) }
        await server.waitForRead()
        if fault == "switch" {
            await model.signIn(idToken: "B", nonce: "fixture")
        } else {
            await model.signOut()
        }
        await server.releaseRead()
        do {
            try await staging.value
            XCTFail("A stale account staged a private decision")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        let sends = await server.saves
        XCTAssertEqual(sends, 0)
        if fault == "switch" {
            let saved = try await model.savedExpenseDecision(model.expenseContext())
            XCTAssertNil(saved)
        }
    }

}

private actor LostDecisionReplyServer {
    let member: VerifiedMember
    var decision: ExpenseDecision?
    var receipt: ExpenseReceipt?
    var saves = 0
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    func pauseNextRead() { pause = true }
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { began = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
    }
    var expired = false
    var preflightFault: String?
    func failPreflight(_ fault: String) {
        preflightFault = fault
        if fault == "expired" { expired = true }
    }
    init(member: VerifiedMember) { self.member = member }
    func prepare(_ value: ExpenseDecision, expired: Bool) {
        decision = value
        self.expired = expired
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if preflightFault == "offline" { throw URLError(.notConnectedToInternet) }
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
        if request.url!.path.hasSuffix("/approval-expiry") {
            let result = FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId, command: .expense,
                expiredUnused: expired, checkedAt: "2026-09-28T08:00:00.000000Z")
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let result = ExpenseApprovalEnvelope(
            version: 1, actorId: preflightFault == "actor" ? UUID() : member.userId,
            householdId: member.householdId,
            approval: .init(
                id: decision.approvalId,
                operationId: preflightFault == "operation" ? UUID() : decision.operationId, expense: decision.expense,
                status: preflightFault == "denied" ? .denied : (receipt == nil ? .pending : .consumed),
                expiresAt: expired ? "2026-09-28T07:00:00.000000Z" : "2099-01-01T00:00:00.000000Z",
                receipt: receipt))
        if pause {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
