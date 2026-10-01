import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringDecisionModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyRecovery(expired: false, update: false)
    }
    func testExpiredCreateAndUpdateNeverSubmit() async throws {
        try await verifyRecovery(expired: true, update: false)
        try await verifyRecovery(expired: true, update: true)
    }
    func testNewDecisionRequiresFreshOnlineUnexpiredExactPrivateProposal() async throws {
        for approved in [true, false] {
            for fault in ["offline", "expired", "operation", "actor", "denied"] {
                try await verifyRecovery(
                    expired: false, update: false, preflightFault: fault, approved: approved)
            }
        }
    }

    private func verifyRecovery(
        expired: Bool, update: Bool, preflightFault: String? = nil, approved: Bool = true
    ) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostRecurringDecisionReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "refund-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let rule = RecurringInput(
            ruleId: UUID(), expectedRevision: update ? UUID() : nil,
            configuration: .init(
                description: "Bill", payerId: member.userId, categoryId: nil,
                note: nil, startDate: try CivilDate("2026-09-01"),
                schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
                mode: .variable, amountCentimes: nil, allocations: nil), firstDueOn: try CivilDate("2026-09-28"))
        let input = RecurringDecision(operationId: UUID(), approvalId: UUID(), rule: rule, approved: approved)
        await server.prepare(input, expired: false)
        if let preflightFault {
            await server.failPreflight(preflightFault)
            try await verifyRefusedPreflight(model, context: context, input: input, server: server)
            return
        }
        try await model.stageRecurringDecision(input, context: context)
        if expired { await server.prepare(input, expired: true) }
        let staged = try await model.savedRecurringDecision(context)
        if expired {
            let result = try await model.retryRecurringDecision(context)
            XCTAssertTrue(result.expiry?.expiredUnused == true)
            XCTAssertEqual(result.expiry?.command, update ? .updateRule : .createRule)
            XCTAssertEqual(result.decision, input)
            let replay = try await model.retryRecurringDecision(context)
            XCTAssertTrue(replay.isTerminal)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            try await model.finishRecurringDecision(context, approvalId: input.approvalId)
            let remaining = try await model.savedRecurringDecision(context)
            XCTAssertNil(remaining)
            return
        }
        do {
            _ = try await model.retryRecurringDecision(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedRecurringDecision(context)
        XCTAssertEqual(pending?.decision, staged?.decision)
        XCTAssertNil(pending?.result?.approval.receipt)
        let recovered = try await model.retryRecurringDecision(context)
        XCTAssertEqual(recovered.result?.approval.status, .consumed)
        XCTAssertEqual(recovered.decision, staged?.decision)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryRecurringDecision(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
    private func verifyRefusedPreflight(
        _ model: SessionModel, context: ExpenseContext, input: RecurringDecision, server: LostRecurringDecisionReplyServer
    ) async throws {
        do {
            try await model.stageRecurringDecision(input, context: context)
            XCTFail("A new financial decision was journaled without valid online preflight")
        } catch {}
        let saved = try await model.savedRecurringDecision(context)
        XCTAssertNil(saved)
        let sends = await server.saves
        XCTAssertEqual(sends, 0)
    }

}

private actor LostRecurringDecisionReplyServer {
    let member: VerifiedMember
    var decision: RecurringDecision?
    var receipt: RecurringReceipt?
    var saves = 0
    var expired = false
    var preflightFault: String?
    func failPreflight(_ fault: String) {
        preflightFault = fault
        if fault == "expired" { expired = true }
    }
    init(member: VerifiedMember) { self.member = member }
    func prepare(_ value: RecurringDecision, expired: Bool) {
        decision = value
        self.expired = expired
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if preflightFault == "offline" { throw URLError(.notConnectedToInternet) }
        if request.url!.path.hasSuffix("/decide") {
            let input = try JSONDecoder().decode(RecurringDecision.self, from: request.httpBody!)
            guard input == decision else { throw NestAPIFailure.contract }
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, approvalId: input.approvalId, revision: UUID(), status: .active,
                rule: input.rule)
            throw URLError(.networkConnectionLost)
        }
        guard let decision else { throw NestAPIFailure.contract }
        if request.url!.path.hasSuffix("/approval-expiry") {
            let result = FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId,
                command: decision.rule.expectedRevision == nil ? .createRule : .updateRule,
                expiredUnused: expired, checkedAt: "2026-09-28T08:00:00.000000Z")
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let result = RecurringApprovalEnvelope(
            version: 1, actorId: preflightFault == "actor" ? UUID() : member.userId,
            householdId: member.householdId,
            approval: .init(
                id: decision.approvalId,
                operationId: preflightFault == "operation" ? UUID() : decision.operationId, rule: decision.rule,
                status: preflightFault == "denied" ? .denied : (receipt == nil ? .pending : .consumed),
                expiresAt: expired ? "2026-09-28T07:00:00.000000Z" : "2099-01-01T00:00:00.000000Z",
                receipt: receipt))
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
