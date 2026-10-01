import Foundation
import XCTest

@testable import Nest

@MainActor
final class ExpenseRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyEntry()
    }

    func testOfflineOrChangedHouseholdCannotJournalANewEntry() async throws {
        for fault in ["offline", "member", "household"] {
            try await verifyEntry(fault: fault)
        }
    }

    private func verifyEntry(fault: String? = nil) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostExpenseReplyServer(member: member, partner: partner, fault: fault)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "expense-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let input = ExpenseInput(
            description: "Fixture", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        if fault != nil {
            try await verifyRefusedEntry(model, context: context, input: input, server: server)
            return
        }
        try await model.stageExpense(input, context: context)
        let staged = try await model.savedExpense(context)
        do {
            _ = try await model.retryExpense(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedExpense(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        let recovered = try await model.retryExpense(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
    }
    private func verifyRefusedEntry(
        _ model: SessionModel, context: ExpenseContext, input: ExpenseInput,
        server: LostExpenseReplyServer
    ) async throws {
        do {
            try await model.stageExpense(input, context: context)
            XCTFail("New financial entry was journaled without current authorized data")
        } catch {}
        let saved = try await model.savedExpense(context)
        XCTAssertNil(saved)
        let saves = await server.saves
        XCTAssertEqual(saves, 0)
    }

}

private actor LostExpenseReplyServer {
    let member: VerifiedMember
    let partner: UUID
    let fault: String?
    var receipt: ExpenseReceipt?
    var saves = 0
    init(member: VerifiedMember, partner: UUID, fault: String?) {
        self.member = member
        self.partner = partner
        self.fault = fault
    }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if fault == "offline" { throw URLError(.notConnectedToInternet) }
        if request.url!.path == "/v1/money/balance" {
            let balance = MoneyBalance(
                version: 1, householdId: fault == "household" ? UUID() : member.householdId,
                eventCount: "1", openingEstablished: true,
                members: [
                    .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("0")),
                    .init(
                        actorId: fault == "member" ? UUID() : partner, displayName: "Sam",
                        centimes: try Centimes("0")),
                ])
            return (
                try JSONEncoder().encode(balance),
                HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            )
        }

        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveExpense.self, from: request.httpBody!)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, eventId: UUID(), approvalId: nil, expense: command.expense)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = ExpenseRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
