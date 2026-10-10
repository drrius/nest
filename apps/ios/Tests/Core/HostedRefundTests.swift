import Foundation
import XCTest

@testable import NestCore

final class HostedRefundTests: XCTestCase {
    func testFictionalRefundReplayAndRemainingCaps() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_REFUND_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated refund configuration required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional members required")
        }
        let history = try await api.history(token: token, member: member, before: nil)
        guard
            let event = history.events.first(where: {
                $0.kind == .expense && $0.description.hasPrefix("Native verification fixture ")
            })
        else { throw XCTSkip("An existing native fictional expense fixture is required") }
        let context = try await api.refundContext(token: token, member: member, sourceEventId: event.id)
        guard context.refundable, let payer = context.source.event.payerId else {
            throw XCTSkip("Fixture refund already exhausted")
        }
        let total = try Centimes(String(context.remaining.reduce(Int64(0), { $0 + $1.centimes.value })))
        let input = RefundInput(
            sourceEventId: event.id, description: "Native fictional refund verification",
            amountCentimes: total, payerId: payer, allocations: context.remaining,
            expectedRemaining: context.remaining, date: try CivilDate("2026-09-28"),
            note: "Isolated fixture; append-only history")
        let command = SaveRefund(operationId: UUID(), refund: input)
        let receipt = try await api.saveRefund(token: token, member: member, command: command)
        let replay = try await api.saveRefund(token: token, member: member, command: command)
        XCTAssertEqual(receipt.eventId, replay.eventId)
        let recovered = try await api.recoverRefund(token: token, member: member, command: command)
        XCTAssertEqual(recovered.receipt?.eventId, receipt.eventId)
        let after = try await api.refundContext(token: token, member: member, sourceEventId: event.id)
        XCTAssertFalse(after.refundable)
        XCTAssertTrue(after.remaining.allSatisfy({ $0.centimes.value == 0 }))
        XCTAssertEqual(after.source.event.amountCentimes, context.source.event.amountCentimes)
        let stale = SaveRefund(operationId: UUID(), refund: input)
        do {
            _ = try await api.saveRefund(token: token, member: member, command: stale)
            XCTFail("Refunded exhausted shares")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancelled = try await api.cancelRefund(token: token, member: member, command: stale)
        XCTAssertEqual(cancelled.status, .cancelled)
        let detail = try await api.detail(token: token, member: member, eventId: receipt.eventId)
        XCTAssertEqual(detail.event.kind, .refund)
        XCTAssertEqual(detail.event.relatedEventId, event.id)
        let final = try await api.balance(token: token, member: member)
        XCTAssertEqual(UInt64(final.eventCount), UInt64(baseline.eventCount)! + 1)
        for person in baseline.members {
            let delta = try XCTUnwrap(detail.shares.first(where: { $0.id == person.id })).deltaCentimes.value
            XCTAssertEqual(
                final.members.first(where: { $0.id == person.id })?.centimes.value, person.centimes.value + delta)
        }
    }
}
