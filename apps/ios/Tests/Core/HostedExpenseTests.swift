import Foundation
import XCTest

@testable import NestCore

final class HostedExpenseTests: XCTestCase {
    func testFictionalExpenseReplayRecoveryAndCancellation() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_EXPENSE_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated expense test configuration is required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: "https://nest-test-api-drrius-projects.vercel.app")!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard member.displayName.hasPrefix("Test "), baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }),
            let partner = baseline.members.first(where: { $0.id != actor })
        else { throw XCTSkip("Both members must be explicitly fictional test identities") }
        let input = ExpenseInput(
            description: "Native verification fixture \(UUID())", amountCentimes: try Centimes("101"),
            receiptPath: nil, receiptTotalCentimes: nil, payerId: actor,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: actor, other: partner.id),
            date: try CivilDate("2026-09-28"), note: "Isolated test data; retained append-only verification entry.",
            categoryId: nil)
        let command = SaveExpense(operationId: UUID(), expense: input)
        let receipt = try await api.saveExpense(token: token, member: member, command: command)
        let replay = try await api.saveExpense(token: token, member: member, command: command)
        XCTAssertEqual(replay.eventId, receipt.eventId)
        let recovered = try await api.recoverExpense(token: token, member: member, command: command)
        XCTAssertEqual(recovered.status, .recorded)
        XCTAssertEqual(recovered.receipt?.eventId, receipt.eventId)
        let detail = try await api.detail(token: token, member: member, eventId: receipt.eventId)
        XCTAssertEqual(detail.event.amountCentimes.value, 101)
        XCTAssertEqual(detail.shares.first(where: { $0.id == actor })?.deltaCentimes.value, 50)
        let after = try await api.balance(token: token, member: member)
        XCTAssertEqual(UInt64(after.eventCount), UInt64(baseline.eventCount)! + 1)
        for person in baseline.members {
            let delta: Int64 = person.id == actor ? 50 : -50
            XCTAssertEqual(
                after.members.first(where: { $0.id == person.id })?.centimes.value, person.centimes.value + delta)
        }
        let cancelledCommand = SaveExpense(operationId: UUID(), expense: input)
        let cancelled = try await api.cancelExpense(token: token, member: member, command: cancelledCommand)
        XCTAssertEqual(cancelled.status, .cancelled)
        do {
            _ = try await api.saveExpense(token: token, member: member, command: cancelledCommand)
            XCTFail("Saved a cancelled operation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let final = try await api.balance(token: token, member: member)
        XCTAssertEqual(final.eventCount, after.eventCount)
    }
}
