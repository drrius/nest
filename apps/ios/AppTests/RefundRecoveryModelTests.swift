import Foundation
import XCTest

@testable import Nest

@MainActor
final class RefundRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyEntry(fault: nil)
    }

    func testFreshContextRefusesOfflineOrChangedHistoryBeforeJournaling() async throws {
        for fault in ["offline", "household", "source", "changed"] {
            try await verifyEntry(fault: fault)
        }
    }

    func testDelayedContextCannotJournalAfterSignOutOrMemberSwitch() async throws {
        for fault in ["signout", "switch"] { try await verifyEntry(fault: fault) }
    }

    private func verifyEntry(fault: String?) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostRefundReplyServer(member: member, partner: partner, fault: fault)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "refund-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner)
        let input = RefundInput(
            sourceEventId: UUID(), description: "Fixture refund", amountCentimes: try Centimes("101"),
            payerId: member.userId, allocations: shares, expectedRemaining: shares,
            date: try CivilDate("2026-09-28"), note: nil)
        if let fault, ["signout", "switch"].contains(fault) {
            try await verifyInterrupted(model, context: context, input: input, server: server, fault: fault)
            return
        }
        if fault != nil {
            do {
                try await model.stageRefund(input, context: context)
                XCTFail("Changed or unavailable context created a new request")
            } catch {
                XCTAssertTrue(error is NestAPIFailure)
            }
            let saved = try await model.savedRefund(context)
            XCTAssertNil(saved)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            return
        }
        try await model.stageRefund(input, context: context)
        let staged = try await model.savedRefund(context)
        do {
            _ = try await model.retryRefund(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedRefund(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        let recovered = try await model.retryRefund(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryRefund(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
    private func verifyInterrupted(
        _ model: SessionModel, context: ExpenseContext, input: RefundInput,
        server: LostRefundReplyServer, fault: String
    ) async throws {
        let staging = Task { try await model.stageRefund(input, context: context) }
        await server.waitForRead()
        if fault == "switch" {
            await model.signIn(idToken: "B", nonce: "fixture")
        } else {
            await model.signOut()
        }
        await server.releaseRead()
        do {
            try await staging.value
            XCTFail("A stale account created a financial request")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        let saves = await server.saves
        XCTAssertEqual(saves, 0)
        if fault == "switch" {
            let saved = try await model.savedRefund(model.expenseContext())
            XCTAssertNil(saved)
        }
    }
}

private actor LostRefundReplyServer {
    let member: VerifiedMember
    let partner: UUID
    let fault: String?
    var receipt: RefundReceipt?
    var saves = 0
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { began = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
    }
    init(member: VerifiedMember, partner: UUID, fault: String?) {
        self.member = member
        self.partner = partner
        self.fault = fault
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url!.path.hasSuffix("/context") {
            if fault == "offline" { throw URLError(.notConnectedToInternet) }
            if ["signout", "switch"].contains(fault ?? "") {
                waiting = true
                began?.resume()
                began = nil
                await withCheckedContinuation { resume = $0 }
            }
            let sourceId = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
                .first(where: { $0.name == "sourceEventId" })!.value!
            let source = try FinancialCorrectionPreflightFixture.source(
                member: member, partner: partner,
                event: fault == "source" ? UUID() : UUID(uuidString: sourceId)!)
            let value = try FinancialCorrectionPreflightFixture.refund(
                source: source, member: member, partner: partner, fault: fault)
            return (
                try JSONEncoder().encode(value),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }
        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveRefund.self, from: request.httpBody!)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, eventId: UUID(), approvalId: nil, refund: command.refund)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = RefundRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
