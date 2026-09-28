import Foundation
import XCTest

@testable import NestCore

final class HostedVariableCycleTests: XCTestCase {
    func testFictionalBillPostsOnceAndRecovers() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_VARIABLE_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated variable bill configuration required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional members required")
        }
        let today = try await api.recurringRules(token: token, member: member, after: nil).today
        let config = RecurringConfiguration(
            description: "Native bill fixture \(UUID())", payerId: actor,
            categoryId: nil, note: "Isolated variable bill", startDate: today,
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: Int(today.value.suffix(2))!),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let rule = RecurringInput(ruleId: UUID(), expectedRevision: nil, configuration: config, firstDueOn: today)
        let created = try await api.saveRecurring(
            token: token, member: member,
            command: .init(operationId: UUID(), rule: rule))
        let shares = try ExpenseSplit.equal(
            Centimes("101"), payer: actor,
            other: baseline.members.first(where: { $0.id != actor })!.id)
        let command = SaveVariableCycle(
            operationId: UUID(),
            input: .init(
                ruleId: rule.ruleId,
                expectedRevision: created.revision, dueOn: today, amountCentimes: try Centimes("101"),
                allocations: shares))
        let receipt = try await api.saveVariableCycle(token: token, member: member, command: command)
        let replay = try await api.saveVariableCycle(token: token, member: member, command: command)
        let recovered = try await api.recoverVariableCycle(token: token, member: member, command: command)
        XCTAssertEqual(receipt.eventId, replay.eventId)
        XCTAssertEqual(receipt.eventId, recovered.receipt?.eventId)
        let detail = try await api.recurringRule(token: token, member: member, ruleId: rule.ruleId)
        XCTAssertFalse(detail.rule.isDue(on: today))
        XCTAssertEqual(detail.rule.coveredThrough, receipt.cycle.through)
        let final = try await api.balance(token: token, member: member)
        XCTAssertEqual(Int64(final.eventCount), try XCTUnwrap(Int64(baseline.eventCount)) + 1)
        for person in baseline.members {
            let delta: Int64 = person.id == actor ? 50 : -50
            XCTAssertEqual(
                final.members.first(where: { $0.id == person.id })?.centimes.value,
                person.centimes.value + delta)
        }
        _ = try await api.saveRecurringState(
            token: token, member: member,
            command: .init(
                operationId: UUID(),
                change: .init(
                    ruleId: rule.ruleId,
                    expectedRevision: detail.rule.revision, expectedStatus: .active, action: .cancel)))
    }
}
