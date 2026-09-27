import Foundation
import XCTest

@testable import NestCore

final class HostedMealWeekIntegrationTests: XCTestCase {
    func testIsolatedHostedSavedLibraryDetailAndOutsiderDenial() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try token(at: memberPath)
        let outsiderToken = try token(at: outsiderPath)
        let api = MealAPI(http: try NestHTTP(baseURL: apiURL))
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        do {
            _ = try await api.library(token: outsiderToken, member: member)
            XCTFail("Outsider read another household's saved meals")
        } catch { assertDenied(error) }
        let page = try await api.library(token: memberToken, member: member)
        let summary = try XCTUnwrap(page.meals.first, "Synthetic test recipe is missing")
        do {
            _ = try await api.recipe(
                token: outsiderToken, member: member,
                id: summary.id, revision: page.revision)
            XCTFail("Outsider read another household's recipe detail")
        } catch { assertDenied(error) }
        let recipe = try await api.recipe(
            token: memberToken, member: member,
            id: summary.id, revision: page.revision)
        XCTAssertEqual(recipe?.id, summary.id)
        XCTAssertEqual(recipe?.title, summary.title)
    }

    func testIsolatedHostedSavedRecipePlaceReplayOutsiderDenialAndCleanup() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try token(at: memberPath)
        let outsiderToken = try token(at: outsiderPath)
        let api = MealAPI(http: try NestHTTP(baseURL: apiURL))
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        let library = try await api.library(token: memberToken, member: member)
        let summary = try XCTUnwrap(library.meals.first, "Synthetic test recipe is missing")
        let loadedRecipe = try await api.recipe(
            token: memberToken, member: member, id: summary.id, revision: library.revision)
        let recipe = try XCTUnwrap(loadedRecipe)
        let start = try MealWeekStart("2035-04-09")
        let week = try await api.week(token: memberToken, member: member, start: start)
        let target = try XCTUnwrap(
            start.days.flatMap { day in MealSlot.allCases.map { (day, $0) } }
                .first { date, slot in
                    !week.entries.contains { $0.date == date && $0.slot == slot }
                })
        let command = try PlaceSavedRecipe(
            week: week, recipe: recipe, libraryRevision: library.revision,
            operationId: UUID(), date: target.0, slot: target.1)
        do {
            _ = try await api.placeRecipe(
                token: outsiderToken, member: member, week: week,
                recipe: recipe, command: command)
            XCTFail("Outsider placed another household's saved recipe")
        } catch { assertDenied(error) }
        do {
            let placed = try await api.placeRecipe(
                token: memberToken, member: member, week: week,
                recipe: recipe, command: command)
            let replay = try await api.placeRecipe(
                token: memberToken, member: member, week: week,
                recipe: recipe, command: command)
            XCTAssertEqual(replay, placed)
            let fresh = try await api.week(token: memberToken, member: member, start: start)
            XCTAssertEqual(fresh.entries.filter { $0.id == placed.entryId }.count, 1)
            XCTAssertEqual(fresh.entries.first { $0.id == placed.entryId }?.definitionId, recipe.id)
            let retained = try await api.plannedRecipe(
                token: memberToken, member: member, week: fresh, id: placed.entryId)
            XCTAssertEqual(retained.snapshot?.recipe.content, recipe.content)
            XCTAssertEqual(retained.snapshot?.libraryRevision, library.revision)
            do {
                _ = try await api.plannedRecipe(
                    token: outsiderToken, member: member, week: fresh, id: placed.entryId)
                XCTFail("Outsider read another household's retained recipe")
            } catch { assertDenied(error) }
            try await removeRecipeFixture(
                placed.entryId, api: api, token: memberToken, member: member, start: start)
        } catch {
            if let recovered = try? await api.placeRecipe(
                token: memberToken, member: member, week: week,
                recipe: recipe, command: command)
            {
                try? await removeRecipeFixture(
                    recovered.entryId, api: api, token: memberToken, member: member, start: start)
            }
            throw error
        }
    }

    private func removeRecipeFixture(
        _ entryId: UUID, api: MealAPI, token: String,
        member: VerifiedMember, start: MealWeekStart
    ) async throws {
        let week = try await api.week(token: token, member: member, start: start)
        guard let entry = week.entries.first(where: { $0.id == entryId }) else { return }
        let command = try RemoveMeal(week: week, meal: entry, operationId: UUID())
        _ = try await api.remove(
            token: token, member: member, week: week,
            meal: entry, command: command)
        let after = try await api.week(token: token, member: member, start: start)
        XCTAssertFalse(after.entries.contains { $0.id == entryId })
    }

    func testIsolatedHostedMealReadPlaceReplayOutsiderDenialAndCleanup() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try token(at: memberPath)
        let outsiderToken = try token(at: outsiderPath)
        let http = try NestHTTP(baseURL: apiURL)
        let api = MealAPI(http: http)
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        let start = try MealWeekStart("2035-04-02")
        let visibleSlots = try await api.visibleSlots(token: memberToken, member: member)
        XCTAssertFalse(visibleSlots.isEmpty)
        do {
            _ = try await api.visibleSlots(token: outsiderToken, member: member)
            XCTFail("Outsider read another household's cooking slots")
        } catch { assertDenied(error) }
        do {
            _ = try await api.week(token: outsiderToken, member: member, start: start)
            XCTFail("Outsider read another household's meal week")
        } catch { assertDenied(error) }
        let week = try await api.week(token: memberToken, member: member, start: start)
        let target = try XCTUnwrap(
            start.days.flatMap { day in
                MealSlot.allCases.map { (day, $0) }
            }.first { target in
                !week.entries.contains { $0.date == target.0 && $0.slot == target.1 }
            })
        let title = "Nest SwiftUI fictional meal \(UUID())"
        let command = try PlaceMeal(
            week: week, operationId: UUID(), date: target.0,
            slot: target.1, title: title)
        do {
            _ = try await api.place(
                token: outsiderToken, member: member, week: week, command: command)
            XCTFail("Outsider placed a meal in another household")
        } catch { assertDenied(error) }
        do {
            let placed = try await api.place(
                token: memberToken, member: member, week: week, command: command)
            let replay = try await api.place(
                token: memberToken, member: member, week: week, command: command)
            XCTAssertEqual(replay, placed)
            let fresh = try await api.week(token: memberToken, member: member, start: start)
            XCTAssertEqual(fresh.entries.filter { $0.id == placed.entryId }.count, 1)
            XCTAssertEqual(fresh.entries.first { $0.id == placed.entryId }?.title, title)
            let detail = try await api.plannedRecipe(
                token: memberToken, member: member, week: fresh, id: placed.entryId)
            XCTAssertEqual(detail.entry?.title, title)
            XCTAssertNil(detail.snapshot)
            try await removeFixture(
                title: title, api: api, token: memberToken, member: member,
                outsiderToken: outsiderToken, start: start)
        } catch {
            try? await removeFixture(
                title: title, api: api, token: memberToken, member: member,
                outsiderToken: outsiderToken, start: start)
            XCTFail("Hosted meal or cleanup failed for fictional title \(title): \(error)")
            throw error
        }
    }

    private func removeFixture(
        title: String, api: MealAPI, token: String,
        member: VerifiedMember, outsiderToken: String, start: MealWeekStart
    ) async throws {
        let week = try await api.week(token: token, member: member, start: start)
        guard let entry = week.entries.first(where: { $0.title == title }) else { return }
        let command = try RemoveMeal(week: week, meal: entry, operationId: UUID())
        do {
            _ = try await api.remove(
                token: outsiderToken, member: member, week: week,
                meal: entry, command: command)
            XCTFail("Outsider removed another household's meal")
        } catch { assertDenied(error) }
        let response = try await api.remove(
            token: token, member: member, week: week, meal: entry, command: command)
        let replay = try await api.remove(
            token: token, member: member, week: week, meal: entry, command: command)
        XCTAssertEqual(response, replay)
        XCTAssertEqual(response.entryId, entry.id)
        let after = try await api.week(token: token, member: member, start: start)
        XCTAssertFalse(after.entries.contains { $0.id == entry.id })
    }

    private func assertDenied(_ error: Error) {
        XCTAssertTrue(
            (error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
    }

    private func token(at path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
