import Foundation
import XCTest

@testable import NestCore

final class HostedApprovalRecordTests: XCTestCase {
    func testFictionalApprovalRecordsOnce() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw XCTSkip("Fictional member required") }
        let api = MoneyAPI(http: http)
        guard env["NEST_TEST_ALLOW_APPROVAL_RECORD"] == "1",
            let approval = env["NEST_TEST_RECORD_APPROVAL"].flatMap(UUID.init(uuidString:))
        else { throw XCTSkip("Explicit fictional record fixture required") }
        let proposal = try await api.expenseApproval(token: token, member: member, approvalId: approval)
        guard proposal.approval.expense.description == "Test hosted approval record" else {
            throw XCTSkip("Dedicated fictional approval required")
        }
        let decision = ExpenseDecision(
            operationId: proposal.approval.operationId, approvalId: approval,
            expense: proposal.approval.expense, approved: true)
        do {
            _ = try await api.decideExpense(token: outsider, member: member, decision: decision)
            XCTFail("Outsider decided another member’s approval")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }),
            proposal.approval.status == .pending
        else { throw XCTSkip("Fresh fictional proposal required") }
        let result = try await api.decideExpense(token: token, member: member, decision: decision)
        XCTAssertEqual(result.approval.status, .consumed)
        let receipt = try XCTUnwrap(result.approval.receipt)
        let repeated = try await api.decideExpense(token: token, member: member, decision: decision)
        XCTAssertEqual(repeated.approval.receipt?.eventId, receipt.eventId)
        let recovered = try await api.expenseApproval(token: token, member: member, approvalId: approval)
        XCTAssertEqual(recovered.approval.receipt?.eventId, receipt.eventId)
        let after = try await api.balance(token: token, member: member)
        XCTAssertEqual(UInt64(after.eventCount), UInt64(baseline.eventCount)! + 1)
        for person in baseline.members {
            let delta: Int64 = person.id == actor ? 50 : -50
            XCTAssertEqual(
                after.members.first(where: { $0.id == person.id })?.centimes.value,
                person.centimes.value + delta)
        }
    }
}
