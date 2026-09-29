import Foundation
import XCTest

@testable import NestCore

final class HostedRecurringReminderTests: XCTestCase {
    func testFictionalReminderIsolationRecoveryAndNoFinancialPosting() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_RECURRING_REMINDER"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional reminder credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        let money = MoneyAPI(http: http)
        let originalBalance = try await money.balance(token: token, member: member)
        guard originalBalance.members.count == 2,
            originalBalance.members.allSatisfy({ $0.displayName.hasPrefix("Test ") })
        else {
            throw XCTSkip("Fictional household required")
        }
        let day = try CivilDate("2099-01-01")
        let configuration = RecurringConfiguration(
            description: "Test Swift reminder \(UUID())", payerId: member.userId,
            categoryId: nil, note: "Future variable reminder fixture; no posting", startDate: day,
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1), mode: .variable, amountCentimes: nil,
            allocations: nil)
        let create = SaveRecurring(
            operationId: UUID(),
            rule: .init(
                ruleId: UUID(), expectedRevision: nil,
                configuration: configuration, firstDueOn: day))
        let created = try await money.saveRecurring(token: token, member: member, command: create)
        do {
            try await verify(
                api: NotificationAPI(http: http), token: token, outsider: outsider, member: member,
                id: created.rule.ruleId)
        } catch {
            try await cancelFixture(money: money, token: token, member: member, id: created.rule.ruleId)
            throw error
        }
        try await cancelFixture(money: money, token: token, member: member, id: created.rule.ruleId)
        let finalBalance = try await money.balance(token: token, member: member)
        XCTAssertEqual(finalBalance.eventCount, originalBalance.eventCount)
        for person in originalBalance.members {
            XCTAssertEqual(finalBalance.members.first(where: { $0.id == person.id })?.centimes, person.centimes)
        }
    }

    private func verify(api: NotificationAPI, token: String, outsider: String, member: VerifiedMember, id: UUID)
        async throws
    {
        let baseline = try await api.recurringReminder(token: token, member: member, id: id)
        XCTAssertNil(baseline.reminder)
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let command = SaveRecurringReminder(
            operationId: UUID(), ruleId: id, expectedRuleRevision: baseline.rule.revision,
            expectedDueOn: try XCTUnwrap(baseline.rule.nextDueOn), expectedRevision: nil, settings: settings)
        do {
            _ = try await api.recurringReminder(token: outsider, member: member, id: id)
            XCTFail("Outsider read household reminder")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.saveRecurringReminder(token: outsider, member: member, command: command)
            XCTFail("Outsider changed consent")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.saveRecurringReminder(token: token, member: member, command: command)
        let replay = try await api.saveRecurringReminder(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let recovered = try await api.recoverRecurringReminder(
            token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.receipt, receipt)
        try await rejectStale(
            api: api, token: token, member: member, baseline: baseline, settings: settings, receipt: receipt)
        let cancelled = SaveRecurringReminder(
            operationId: UUID(), ruleId: id, expectedRuleRevision: baseline.rule.revision,
            expectedDueOn: command.expectedDueOn, expectedRevision: receipt.reminder.revision, settings: settings)
        let cancellation = try await api.recoverRecurringReminder(
            token: token, member: member, command: cancelled, cancel: true)
        XCTAssertEqual(cancellation.status, .cancelled)
        do {
            _ = try await api.saveRecurringReminder(token: token, member: member, command: cancelled)
            XCTFail("Cancelled reminder saved")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        var offSettings = settings
        offSettings.enabled = false
        let off = SaveRecurringReminder(
            operationId: UUID(), ruleId: id, expectedRuleRevision: baseline.rule.revision,
            expectedDueOn: command.expectedDueOn, expectedRevision: receipt.reminder.revision, settings: offSettings)
        let disabled = try await api.saveRecurringReminder(token: token, member: member, command: off)
        let current = try await api.recurringReminder(token: token, member: member, id: id)
        XCTAssertEqual(current.reminder, disabled.reminder)
        XCTAssertFalse(try XCTUnwrap(current.reminder).settings.enabled)
        XCTAssertEqual(current.rule, baseline.rule, "Reminder choices cannot alter a financial rule")
    }

    private func rejectStale(
        api: NotificationAPI, token: String, member: VerifiedMember, baseline: RecurringReminderContext,
        settings: ReminderSettings, receipt: RecurringReminderReceipt
    ) async throws {
        let due = try XCTUnwrap(baseline.rule.nextDueOn)
        for variant in 0..<3 {
            let command = SaveRecurringReminder(
                operationId: UUID(), ruleId: baseline.rule.id,
                expectedRuleRevision: variant == 0 ? UUID() : baseline.rule.revision,
                expectedDueOn: variant == 1 ? try CivilDate("2099-02-01") : due,
                expectedRevision: variant == 2 ? nil : receipt.reminder.revision, settings: settings)
            do {
                _ = try await api.saveRecurringReminder(token: token, member: member, command: command)
                XCTFail("Stale financial date/revision or reminder overwrote choices")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
            let unchanged = try await api.recurringReminder(token: token, member: member, id: baseline.rule.id)
            XCTAssertEqual(unchanged.rule, baseline.rule)
            XCTAssertEqual(unchanged.reminder, receipt.reminder)
        }
    }

    private func cancelFixture(money: MoneyAPI, token: String, member: VerifiedMember, id: UUID) async throws {
        let current = try await money.recurringRule(token: token, member: member, ruleId: id)
        let cancel = SaveRecurringState(
            operationId: UUID(),
            change: .init(
                ruleId: id,
                expectedRevision: current.rule.revision, expectedStatus: current.rule.status, action: .cancel))
        let cancelled = try await money.saveRecurringState(token: token, member: member, command: cancel)
        XCTAssertEqual(cancelled.status, .cancelled)
        let final = try await money.recurringRule(token: token, member: member, ruleId: id)
        XCTAssertEqual(final.rule.status, .cancelled)
    }
}
