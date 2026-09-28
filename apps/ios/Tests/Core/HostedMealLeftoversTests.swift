import Foundation
import XCTest

@testable import NestCore

final class HostedMealLeftoversTests: XCTestCase {
    func testCrossWeekLeftoversReplayDenialAndCleanup() async throws {
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
        let start = try MealWeekStart("2035-05-07")
        let next = try start.adjacent(1)
        let source = try await api.week(token: token, member: member, start: start)
        let target = try await api.week(token: token, member: member, start: next)
        let from = try emptySlot(source)
        let to = try emptySlot(target)
        let title = "Synthetic leftovers \(UUID())"
        let place = try PlaceMeal(week: source, operationId: UUID(), date: from.0, slot: from.1, title: title)
        do {
            let receipt = try await api.place(token: token, member: member, week: source, command: place)
            let fresh = try await api.week(token: token, member: member, start: start)
            let meal = try XCTUnwrap(fresh.entries.first { $0.id == receipt.entryId })
            let command = try PlaceLeftovers(
                source: fresh, target: target, meal: meal,
                operationId: UUID(), date: to.0, slot: to.1)
            do {
                _ = try await api.placeLeftovers(
                    token: outsider, member: member, source: fresh, target: target, meal: meal, placement: command)
                XCTFail("Outsider moved another household's meal")
            } catch {
                XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
            }
            let moved = try await api.placeLeftovers(
                token: token, member: member, source: fresh, target: target, meal: meal, placement: command)
            let replay = try await api.placeLeftovers(
                token: token, member: member, source: fresh, target: target, meal: meal, placement: command)
            XCTAssertEqual(moved, replay)
            let afterSource = try await api.week(token: token, member: member, start: start)
            let afterTarget = try await api.week(token: token, member: member, start: next)
            XCTAssertTrue(afterSource.entries.contains(meal))
            XCTAssertEqual(afterSource.revision, fresh.revision)
            let movedMeal = try XCTUnwrap(afterTarget.entries.first { $0.id == moved.entryId })
            XCTAssertEqual(movedMeal.leftoverSourceId, meal.id)
            XCTAssertNotEqual(movedMeal.id, meal.id)
            XCTAssertEqual(movedMeal.title, title)
            XCTAssertEqual(movedMeal.date, to.0)
            XCTAssertEqual(movedMeal.slot, to.1)
        } catch {
            try await cleanup(title, starts: [next, start], api: api, token: token, member: member)
            throw error
        }
        try await cleanup(title, starts: [next, start], api: api, token: token, member: member)
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
            if let meal = week.entries.first(where: { $0.title == title }) {
                let command = try RemoveMeal(week: week, meal: meal, operationId: UUID())
                _ = try await api.remove(token: token, member: member, week: week, meal: meal, command: command)
            }
            let after = try await api.week(token: token, member: member, start: start)
            XCTAssertFalse(after.entries.contains { $0.title == title }, "Synthetic leftovers fixture remains")
        }
    }
}
