import Foundation
import XCTest

@testable import Nest

@MainActor
final class FinancialCategoryPreflightTests: XCTestCase {
    func testApprovalRequiresCurrentCategoryButDeclineDoesNot() async throws {
        for family in ["expense", "correction"] {
            for fault in ["missing", "offline", "foreign", "valid"] {
                try await verify(family: family, fault: fault, approved: true)
            }
            try await verify(family: family, fault: "offline", approved: false)
        }
    }

    private func verify(family: String, fault: String, approved: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let category = UUID()
        let approval = UUID()
        let operation = UUID()
        let auth = FakeAuthentication(active: .init(userId: member.userId, accessToken: "token-A"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let expense = ExpenseInput(
            description: "Category preflight", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: try CivilDate("2026-10-07"), note: nil, categoryId: category)
        let correction = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: .expense(expense))
        let expenseEnvelope = ExpenseApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: approval, operationId: operation, expense: expense, status: .pending,
                expiresAt: "2099-01-01T00:00:00.000000Z", receipt: nil))
        let correctionEnvelope = CorrectionApprovalEnvelope(
            version: 1, actorId: member.userId, householdId: member.householdId,
            approval: .init(
                id: approval, operationId: operation, correction: correction, status: .pending,
                expiresAt: "2099-01-01T00:00:00.000000Z", receipt: nil))
        let data =
            try family == "expense" ? JSONEncoder().encode(expenseEnvelope) : JSONEncoder().encode(correctionEnvelope)
        let categoryData = try JSONEncoder().encode(
            MoneyCategoryEnvelope(
                version: 1, householdId: fault == "foreign" ? UUID() : member.householdId, categoryId: category,
                category: fault == "missing" ? nil : .init(categoryId: category, name: "Home", archived: false)))
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.httpMethod, "GET", "Preflight must not send a decision")
            let isCategory = request.url?.path == "/v1/money/category"
            if isCategory && fault == "offline" { throw URLError(.notConnectedToInternet) }
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (isCategory ? categoryData : data, response)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "category-preflight-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let shouldStage = !approved || fault == "valid"
        do {
            if family == "expense" {
                try await model.stageExpenseDecision(
                    .init(
                        operationId: operation, approvalId: approval, expense: expense,
                        approved: approved), context: context)
            } else {
                try await model.stageCorrectionDecision(
                    .init(
                        operationId: operation, approvalId: approval,
                        correction: correction, approved: approved), context: context)
            }
            XCTAssertTrue(shouldStage, "Approval must not stage without current category metadata")
        } catch {
            XCTAssertFalse(shouldStage, "A valid approval or decline was refused: \(error)")
        }
        let staged =
            family == "expense"
            ? try await model.savedExpenseDecision(context) != nil
            : try await model.savedCorrectionDecision(context) != nil
        XCTAssertEqual(staged, shouldStage)
    }
}
