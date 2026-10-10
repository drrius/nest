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
                XCTFail("Outsider added leftovers in another household")
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
            try await verifySameWeek(api: api, token: token, member: member, week: afterSource, meal: meal)
        } catch {
            try await cleanup(title, starts: [next, start], api: api, token: token, member: member)
            throw error
        }
        try await cleanup(title, starts: [next, start], api: api, token: token, member: member)
    }

    private func verifySameWeek(
        api: MealAPI, token: String, member: VerifiedMember,
        week: MealWeekSnapshot, meal: PlannedMeal
    ) async throws {
        let destination = try XCTUnwrap(
            week.weekStart.days.flatMap { day in MealSlot.allCases.map { (day, $0) } }
                .first { day, slot in
                    day.value > meal.date.value && !week.entries.contains { $0.date == day && $0.slot == slot }
                })
        let placement = try PlaceLeftovers(
            source: week, target: week, meal: meal, operationId: UUID(),
            date: destination.0, slot: destination.1)
        let receipt = try await api.placeLeftovers(
            token: token, member: member, source: week, target: week, meal: meal, placement: placement)
        let replay = try await api.placeLeftovers(
            token: token, member: member, source: week, target: week, meal: meal, placement: placement)
        XCTAssertEqual(receipt, replay)
        XCTAssertEqual(receipt.sourceRevision, receipt.targetRevision)
        let fresh = try await api.week(token: token, member: member, start: week.weekStart)
        XCTAssertEqual(fresh.revision, receipt.targetRevision)
        XCTAssertTrue(fresh.entries.contains(meal))
        let leftovers = try XCTUnwrap(fresh.entries.first { $0.id == receipt.entryId })
        XCTAssertEqual(leftovers.leftoverSourceId, meal.id)
        XCTAssertEqual(leftovers.date, destination.0)
        XCTAssertEqual(leftovers.slot, destination.1)
        XCTAssertEqual(fresh.entries.filter { $0.id == receipt.entryId }.count, 1)
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
            let fixtures = week.entries.filter { $0.title == title }
                .sorted { $0.leftoverSourceId != nil && $1.leftoverSourceId == nil }
            for fixture in fixtures {
                let current = try await api.week(token: token, member: member, start: start)
                guard let meal = current.entries.first(where: { $0.id == fixture.id }) else { continue }
                let command = try RemoveMeal(week: current, meal: meal, operationId: UUID())
                _ = try await api.remove(token: token, member: member, week: current, meal: meal, command: command)
            }
            let after = try await api.week(token: token, member: member, start: start)
            XCTAssertFalse(after.entries.contains { $0.title == title }, "Synthetic leftovers fixture remains")
        }
    }
}
