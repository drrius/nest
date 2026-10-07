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

    func testDelayedCategoryReplyCannotJournalAfterAccountSwitch() async throws {
        for family in ["expense", "correction"] {
            try await verify(family: family, fault: "switch", approved: true)
        }
    }

    private func verify(family: String, fault: String, approved: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let category = UUID()
        let approval = UUID()
        let operation = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
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
        let gate = CategoryReplyGate()
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            XCTAssertEqual(request.httpMethod, "GET", "Preflight must not send a decision")
            let isCategory = request.url?.path == "/v1/money/category"
            if isCategory && fault == "offline" { throw URLError(.notConnectedToInternet) }
            if isCategory && fault == "switch" { await gate.pause() }
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
        if fault == "switch" {
            try await verifySwitchedReply(
                model, context: context, expense: expense, correction: correction,
                family: family, approval: approval, operation: operation, gate: gate)
            return
        }
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

    private func verifySwitchedReply(
        _ model: SessionModel, context: ExpenseContext, expense: ExpenseInput, correction: CorrectionInput,
        family: String, approval: UUID, operation: UUID, gate: CategoryReplyGate
    ) async throws {
        let staging = Task {
            if family == "expense" {
                try await model.stageExpenseDecision(
                    .init(operationId: operation, approvalId: approval, expense: expense, approved: true),
                    context: context)
            } else {
                try await model.stageCorrectionDecision(
                    .init(operationId: operation, approvalId: approval, correction: correction, approved: true),
                    context: context)
            }
        }
        await gate.waitForRequest()
        await model.signIn(idToken: "B", nonce: "fixture")
        await gate.release()
        do {
            try await staging.value
            XCTFail("An old account's category reply staged a decision")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        let current = try model.expenseContext()
        XCTAssertNotEqual(current.member.userId, context.member.userId)
        let expenseDecision = try await model.savedExpenseDecision(current)
        let correctionDecision = try await model.savedCorrectionDecision(current)
        XCTAssertNil(expenseDecision)
        XCTAssertNil(correctionDecision)
    }
}

private actor CategoryReplyGate {
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    func pause() async {
        waiting = true
        started?.resume()
        started = nil
        await withCheckedContinuation { resume = $0 }
    }

    func waitForRequest() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }

    func release() {
        resume?.resume()
        resume = nil
    }
}
