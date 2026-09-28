import Foundation
import XCTest

@testable import NestCore

final class HostedRecurringTests: XCTestCase {
    func testFictionalRuleCreateEditPauseResumeCancel() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_ALLOW_RECURRING_WRITE"] == "1",
            env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated recurring configuration required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let api = MoneyAPI(http: http)
        let baseline = try await api.balance(token: token, member: member)
        guard baseline.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional members required")
        }
        let future = try CivilDate("2099-01-01")
        let config = RecurringConfiguration(
            description: "Native recurring fixture \(UUID())", payerId: member.userId,
            categoryId: nil, note: "Isolated variable fixture", startDate: future,
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1), mode: .variable, amountCentimes: nil,
            allocations: nil)
        let input = RecurringInput(ruleId: UUID(), expectedRevision: nil, configuration: config, firstDueOn: future)
        let command = SaveRecurring(operationId: UUID(), rule: input)
        let receipt = try await api.saveRecurring(token: token, member: member, command: command)
        let replay = try await api.saveRecurring(token: token, member: member, command: command)
        XCTAssertEqual(receipt.revision, replay.revision)
        let recovery = try await api.recoverRecurring(token: token, member: member, command: command)
        XCTAssertEqual(recovery.receipt?.revision, receipt.revision)
        let original = try await api.recurringRule(token: token, member: member, ruleId: input.ruleId)
        var draft = RecurringDraft(member: member, today: original.today, existing: original.rule)
        draft.note = "Edited isolated variable fixture"
        let edited = try await api.saveRecurring(
            token: token, member: member,
            command: .init(
                operationId: UUID(),
                rule: draft.reviewed(member: member, members: baseline.members.map(\.id), today: original.today)))
        XCTAssertNotEqual(edited.revision, receipt.revision)
        try await manage(api: api, token: token, member: member, rule: edited, future: future)
        let final = try await api.balance(token: token, member: member)
        XCTAssertEqual(final.eventCount, baseline.eventCount)
        for person in baseline.members {
            XCTAssertEqual(final.members.first(where: { $0.id == person.id })?.centimes, person.centimes)
        }
    }

    private func manage(api: MoneyAPI, token: String, member: VerifiedMember, rule: RecurringReceipt, future: CivilDate)
        async throws
    {
        let pause = SaveRecurringState(
            operationId: UUID(),
            change: .init(
                ruleId: rule.rule.ruleId,
                expectedRevision: rule.revision, expectedStatus: .active, action: .pause))
        let paused = try await api.saveRecurringState(token: token, member: member, command: pause)
        let replay = try await api.saveRecurringState(token: token, member: member, command: pause)
        XCTAssertEqual(paused.revision, replay.revision)
        let resume = SaveRecurringResume(
            operationId: UUID(),
            change: .init(
                ruleId: rule.rule.ruleId,
                expectedRevision: paused.revision, expectedStatus: "paused", action: "resume", resumeFrom: future,
                firstDueOn: future))
        let resumed = try await api.saveRecurringResume(token: token, member: member, command: resume)
        let recovered = try await api.recoverRecurringResume(token: token, member: member, command: resume)
        XCTAssertEqual(resumed.revision, recovered.receipt?.revision)
        let cancel = SaveRecurringState(
            operationId: UUID(),
            change: .init(
                ruleId: rule.rule.ruleId,
                expectedRevision: resumed.revision, expectedStatus: .active, action: .cancel))
        let cancelled = try await api.saveRecurringState(token: token, member: member, command: cancel)
        XCTAssertEqual(cancelled.status, .cancelled)
        let final = try await api.recurringRule(token: token, member: member, ruleId: rule.rule.ruleId)
        XCTAssertEqual(final.rule.status, .cancelled)
        XCTAssertEqual(final.rule.configuration.note, "Edited isolated variable fixture")
    }
}
