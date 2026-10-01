import Foundation
import XCTest

@testable import Nest

@MainActor
final class SettlementDecisionModelTests: XCTestCase {
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
        let server = LostSettlementDecisionReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "settlement-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let settlement = SettlementInput(
            description: "Payment fixture", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId, recipientId: partner,
            mode: .full, date: try CivilDate("2026-09-28"), note: nil)
        let input = SettlementDecision(operationId: UUID(), approvalId: UUID(), settlement: settlement, approved: approved)
        await server.prepare(input, expired: false)
        if let preflightFault {
            await server.failPreflight(preflightFault)
            try await verifyRefusedPreflight(model, context: context, input: input, server: server)
            return
        }
        try await model.stageSettlementDecision(input, context: context)
        if expired { await server.prepare(input, expired: true) }
        let staged = try await model.savedSettlementDecision(context)
        if expired {
            let recovered = try await model.retrySettlementDecision(context)
            XCTAssertTrue(recovered.isTerminal)
            XCTAssertTrue(recovered.expiry?.expiredUnused == true)
            XCTAssertEqual(recovered.decision, input)
            let replay = try await model.retrySettlementDecision(context)
            XCTAssertTrue(replay.expiry?.expiredUnused == true)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            try await model.finishSettlementDecision(context, approvalId: input.approvalId)
            let cleared = try await model.savedSettlementDecision(context)
            XCTAssertNil(cleared)
            return
        }
        do {
            _ = try await model.retrySettlementDecision(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedSettlementDecision(context)
        XCTAssertEqual(pending?.decision, staged?.decision)
        XCTAssertNil(pending?.result?.approval.receipt)
        let recovered = try await model.retrySettlementDecision(context)
        XCTAssertEqual(recovered.result?.approval.status, .consumed)
        XCTAssertEqual(recovered.decision, staged?.decision)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retrySettlementDecision(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
    private func verifyRefusedPreflight(
        _ model: SessionModel, context: ExpenseContext, input: SettlementDecision, server: LostSettlementDecisionReplyServer
    ) async throws {
        do {
            try await model.stageSettlementDecision(input, context: context)
            XCTFail("A new financial decision was journaled without valid online preflight")
        } catch {}
        let saved = try await model.savedSettlementDecision(context)
        XCTAssertNil(saved)
        let sends = await server.saves
        XCTAssertEqual(sends, 0)
    }

}

private actor LostSettlementDecisionReplyServer {
    let member: VerifiedMember
    var decision: SettlementDecision?
    var receipt: SettlementReceipt?
    var saves = 0
    var expired = false
    var preflightFault: String?
    func failPreflight(_ fault: String) {
        preflightFault = fault
        if fault == "expired" { expired = true }
    }
    init(member: VerifiedMember) { self.member = member }
    func prepare(_ value: SettlementDecision, expired: Bool) {
        decision = value
        self.expired = expired
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if preflightFault == "offline" { throw URLError(.notConnectedToInternet) }
        if request.url!.path.hasSuffix("/decide") {
            let input = try JSONDecoder().decode(SettlementDecision.self, from: request.httpBody!)
            guard input == decision else { throw NestAPIFailure.contract }
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, eventId: UUID(), approvalId: input.approvalId,
                settlement: input.settlement)
            throw URLError(.networkConnectionLost)
        }
        guard let decision else { throw NestAPIFailure.contract }
        if request.url!.path.hasSuffix("/approval-expiry") {
            let result = FinancialApprovalExpiry(
                version: 1, actorId: member.userId, householdId: member.householdId,
                approvalId: decision.approvalId, operationId: decision.operationId, command: .settlement,
                expiredUnused: expired, checkedAt: "2026-09-28T08:00:00.000000Z")
            return (
                try JSONEncoder().encode(result),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        let result = SettlementApprovalEnvelope(
            version: 1, actorId: preflightFault == "actor" ? UUID() : member.userId,
            householdId: member.householdId,
            approval: .init(
                id: decision.approvalId,
                operationId: preflightFault == "operation" ? UUID() : decision.operationId, settlement: decision.settlement,
                status: preflightFault == "denied" ? .denied : (receipt == nil ? .pending : .consumed),
                expiresAt: expired ? "2026-09-28T07:00:00.000000Z" : "2099-01-01T00:00:00.000000Z",
                receipt: receipt))
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
