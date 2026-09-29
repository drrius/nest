import Foundation
import XCTest

@testable import NestCore

final class HostedMealReminderTests: XCTestCase {
    func testFictionalReminderIsolationReplayAndCancellation() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_MEAL_REMINDER"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional reminder credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let meals = MealAPI(http: http)
        let api = NotificationAPI(http: http)
        let member = try await meals.verify(token: token, expectedActor: actor)
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        guard roster.members.count == 2, roster.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional household required")
        }
        let start = try MealWeekStart("2035-05-21")
        let week = try await meals.week(token: token, member: member, start: start)
        let slot = try XCTUnwrap(
            week.weekStart.days.flatMap { date in MealSlot.allCases.map { (date, $0) } }
                .first { date, slot in !week.entries.contains { $0.date == date && $0.slot == slot } })
        let title = "Synthetic Swift reminder " + UUID().uuidString
        let place = try PlaceMeal(week: week, operationId: UUID(), date: slot.0, slot: slot.1, title: title)
        do {
            let receipt = try await meals.place(token: token, member: member, week: week, command: place)
            try await verify(api: api, token: token, outsider: outsider, member: member, id: receipt.entryId)
        } catch {
            try await cleanup(title: title, start: start, api: meals, token: token, member: member)
            throw error
        }
        try await cleanup(title: title, start: start, api: meals, token: token, member: member)
    }

    private func cleanup(title: String, start: MealWeekStart, api: MealAPI, token: String, member: VerifiedMember)
        async throws
    {
        let week = try await api.week(token: token, member: member, start: start)
        if let meal = week.entries.first(where: { $0.title == title }) {
            let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
            _ = try await api.remove(token: token, member: member, week: week, meal: meal, command: command)
        }
        let after = try await api.week(token: token, member: member, start: start)
        XCTAssertFalse(after.entries.contains { $0.title == title }, "Fictional reminder meal remains")
    }

    private func verify(api: NotificationAPI, token: String, outsider: String, member: VerifiedMember, id: UUID)
        async throws
    {
        let baseline = try await api.mealReminder(token: token, member: member, id: id)
        XCTAssertNil(baseline.reminder)
        let settings = ReminderSettings(enabled: true, recipientIds: [member.userId], localTime: "08:00", daysBefore: 1)
        let command = SaveMealReminder(
            operationId: UUID(), entryId: id,
            expectedItemRevision: baseline.itemRevision, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.mealReminder(token: outsider, member: member, id: id)
            XCTFail("Outsider read household reminder")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.saveMealReminder(token: outsider, member: member, command: command)
            XCTFail("Outsider changed recipient consent")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.saveMealReminder(token: token, member: member, command: command)
        let replay = try await api.saveMealReminder(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let recovered = try await api.recoverMealReminder(
            token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.receipt, receipt)
        let changed = SaveMealReminder(
            operationId: UUID(), entryId: id,
            expectedItemRevision: baseline.itemRevision, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.saveMealReminder(token: token, member: member, command: changed)
            XCTFail("Stale reminder revision overwrote choices")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancelled = try await api.recoverMealReminder(token: token, member: member, command: changed, cancel: true)
        XCTAssertEqual(cancelled.status, .cancelled)
        do {
            _ = try await api.saveMealReminder(token: token, member: member, command: changed)
            XCTFail("Cancelled reminder request was recorded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        var disabled = settings
        disabled.enabled = false
        let off = SaveMealReminder(
            operationId: UUID(), entryId: id,
            expectedItemRevision: baseline.itemRevision,
            expectedRevision: receipt.reminder.revision, settings: disabled)
        let offReceipt = try await api.saveMealReminder(token: token, member: member, command: off)
        let current = try await api.mealReminder(token: token, member: member, id: id)
        XCTAssertEqual(current.reminder, offReceipt.reminder)
        XCTAssertFalse(try XCTUnwrap(current.reminder).settings.enabled)
    }
}
