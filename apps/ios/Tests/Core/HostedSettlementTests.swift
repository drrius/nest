import Foundation
import XCTest

@testable import NestCore

final class HostedSettlementTests: XCTestCase {
    func testFictionalPartialFullReplayAndStaleBalance() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_SETTLEMENT_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated settlement configuration required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }),
            baseline.members.contains(where: { $0.centimes.value > 1 })
        else {
            throw XCTSkip(
                "Fictional positive balance greater than one centime required; never fabricate production balances")
        }
        let date = try CivilDate("2026-09-28")
        let partial = try SettlementDraft(mode: .partial, amount: "0.01", note: "Isolated fixture payment record")
            .reviewed(balance: baseline, member: member, date: date)
        let command = SaveSettlement(operationId: UUID(), settlement: partial)
        let recorded = try await api.saveSettlement(token: token, member: member, command: command)
        let replay = try await api.saveSettlement(token: token, member: member, command: command)
        XCTAssertEqual(recorded.eventId, replay.eventId)
        let recovered = try await api.recoverSettlement(token: token, member: member, command: command)
        XCTAssertEqual(recovered.receipt?.eventId, recorded.eventId)
        let afterPartial = try await api.balance(token: token, member: member)
        XCTAssertEqual(UInt64(afterPartial.eventCount), UInt64(baseline.eventCount)! + 1)
        XCTAssertEqual(
            afterPartial.members.first(where: { $0.id == partial.recipientId })?.centimes.value,
            partial.expectedOutstandingCentimes.value - 1)
        let stale = SaveSettlement(operationId: UUID(), settlement: partial)
        do {
            _ = try await api.saveSettlement(token: token, member: member, command: stale)
            XCTFail("Recorded against stale outstanding balance")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancellation = try await api.cancelSettlement(token: token, member: member, command: stale)
        XCTAssertEqual(cancellation.status, .cancelled)
        let full = try SettlementDraft().reviewed(balance: afterPartial, member: member, date: date)
        let fullCommand = SaveSettlement(operationId: UUID(), settlement: full)
        let fullReceipt = try await api.saveSettlement(token: token, member: member, command: fullCommand)
        let detail = try await api.detail(token: token, member: member, eventId: fullReceipt.eventId)
        XCTAssertEqual(detail.event.kind, .settlement)
        XCTAssertEqual(detail.event.amountCentimes, full.amountCentimes)
        let final = try await api.balance(token: token, member: member)
        XCTAssertTrue(final.members.allSatisfy({ $0.centimes.value == 0 }))
        XCTAssertEqual(UInt64(final.eventCount), UInt64(baseline.eventCount)! + 2)
    }
}
