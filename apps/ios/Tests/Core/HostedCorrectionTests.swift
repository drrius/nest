import Foundation
import XCTest

@testable import NestCore

final class HostedCorrectionTests: XCTestCase {
    func testFictionalReplacementReplayAndUndoPreserveHistory() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_CORRECTION_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated correction configuration required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }),
            let partner = baseline.members.first(where: { $0.id != member.userId })
        else { throw XCTSkip("Fictional members required") }
        let expense = ExpenseInput(
            description: "Native correction fixture \(UUID())", amountCentimes: try Centimes("101"),
            receiptPath: nil, receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner.id),
            date: try CivilDate("2026-09-28"), note: "Isolated append-only fixture", categoryId: nil)
        let original = try await api.saveExpense(
            token: token, member: member, command: .init(operationId: UUID(), expense: expense))
        let context = try await api.correctionContext(token: token, member: member, sourceEventId: original.eventId)
        XCTAssertTrue(context.canReplace)
        var draft = try CorrectionDraft(source: context.source)
        draft.replace = true
        draft.amount = "1.03"
        draft.shares[member.userId] = "0.52"
        draft.shares[partner.id] = "0.51"
        let command = SaveCorrection(
            operationId: UUID(), correction: try draft.reviewed(context: context, member: member))
        let receipt = try await api.saveCorrection(token: token, member: member, command: command)
        let replay = try await api.saveCorrection(token: token, member: member, command: command)
        XCTAssertEqual(receipt.reversalEventId, replay.reversalEventId)
        XCTAssertEqual(receipt.replacementEventId, replay.replacementEventId)
        let recovered = try await api.recoverCorrection(token: token, member: member, command: command)
        XCTAssertEqual(recovered.receipt?.replacementEventId, receipt.replacementEventId)
        let after = try await api.correctionContext(token: token, member: member, sourceEventId: original.eventId)
        XCTAssertFalse(after.canReverse)
        XCTAssertFalse(after.canReplace)
        XCTAssertEqual(after.source.event.amountCentimes, expense.amountCentimes)
        XCTAssertEqual(after.source.reversedById, receipt.reversalEventId)
        let replacement = try XCTUnwrap(receipt.replacementEventId)
        let detail = try await api.detail(token: token, member: member, eventId: replacement)
        XCTAssertEqual(detail.event.kind, .replacement)
        XCTAssertEqual(detail.event.amountCentimes.value, 103)
        let undo = SaveCorrection(
            operationId: UUID(),
            correction: .init(
                sourceEventId: replacement, expectedReversalId: nil, replacement: nil))
        let undone = try await api.saveCorrection(token: token, member: member, command: undo)
        XCTAssertNil(undone.replacementEventId)
        let final = try await api.balance(token: token, member: member)
        XCTAssertEqual(UInt64(final.eventCount), UInt64(baseline.eventCount)! + 4)
        for person in baseline.members {
            XCTAssertEqual(final.members.first(where: { $0.id == person.id })?.centimes, person.centimes)
        }
    }
}
