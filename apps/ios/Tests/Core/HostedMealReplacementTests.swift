import Foundation
import XCTest

@testable import NestCore

final class HostedMealReplacementTests: XCTestCase {
    func testReplacementReplayDenialAndCleanup() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"],
            url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let api = MealAPI(http: try NestHTTP(baseURL: URL(string: url)!))
        let member = try await api.verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let start = try MealWeekStart("2035-05-21")
        let source = try await api.week(token: token, member: member, start: start)
        let from = try emptySlot(source)
        let title = "Synthetic replacement \(UUID())"
        let place = try PlaceMeal(week: source, operationId: UUID(), date: from.0, slot: from.1, title: title)
        do {
            let receipt = try await api.place(token: token, member: member, week: source, command: place)
            let fresh = try await api.week(token: token, member: member, start: start)
            let meal = try XCTUnwrap(fresh.entries.first { $0.id == receipt.entryId })
            let command = try ReplaceMeal(
                week: fresh, meal: meal,
                operationId: UUID(), title: title + " updated")
            do {
                _ = try await api.replace(token: outsider, member: member, week: fresh, meal: meal, command: command)
                XCTFail("Outsider replaced another household's meal")
            } catch {
                XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
            }
            let moved = try await api.replace(token: token, member: member, week: fresh, meal: meal, command: command)
            let replay = try await api.replace(token: token, member: member, week: fresh, meal: meal, command: command)
            XCTAssertEqual(moved, replay)
            let after = try await api.week(token: token, member: member, start: start)
            XCTAssertFalse(after.entries.contains { $0.id == meal.id })
            let replacement = try XCTUnwrap(after.entries.first { $0.id == moved.entryId })
            XCTAssertEqual(replacement.title, title + " updated")
            XCTAssertEqual(replacement.date, meal.date)
            XCTAssertEqual(replacement.slot, meal.slot)
            XCTAssertEqual(after.revision, moved.revision)

        } catch {
            try await cleanup(title, starts: [start], api: api, token: token, member: member)
            throw error
        }
        try await cleanup(title, starts: [start], api: api, token: token, member: member)
    }

    private func emptySlot(_ week: MealWeekSnapshot) throws -> (CivilDate, MealSlot) {
        try XCTUnwrap(
            week.weekStart.days.flatMap { date in MealSlot.allCases.map { (date, $0) } }
                .first { date, slot in !week.entries.contains { $0.date == date && $0.slot == slot } })
    }

    private func cleanup(
        _ title: String, starts: [MealWeekStart], api: MealAPI,
        token: String, member: VerifiedMember
    ) async throws {
        for start in starts {
            let week = try await api.week(token: token, member: member, start: start)
            if let meal = week.entries.first(where: { ($0.title == title || $0.title == title + " updated") }) {
                let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
                _ = try await api.remove(token: token, member: member, week: week, meal: meal, command: command)
            }
            let after = try await api.week(token: token, member: member, start: start)
            XCTAssertFalse(
                after.entries.contains { ($0.title == title || $0.title == title + " updated") },
                "Synthetic replacement fixture remains")
        }
    }
}
