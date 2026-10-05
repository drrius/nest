import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedManualMealWeekTests: XCTestCase {
    private let title = "Nest native manual week 20261005"
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testNormalMemberReadsOwnedRecipeAndExactWeek() async throws {
        let environment = ProcessInfo.processInfo.environment
        let role = try role(environment)
        let phase = try XCTUnwrap(environment["NEST_QA_MANUAL_WEEK_PHASE"])
        let count = try XCTUnwrap(Int(try XCTUnwrap(environment["NEST_QA_MANUAL_WEEK_COUNT"])))
        XCTAssertTrue(["absent", "recipe", "partial", "full"].contains(phase))
        XCTAssertTrue((0...7).contains(count))
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        do {
            let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("week-read.sqlite"))
            let auth = try NestAuth(configuration: configuration, offline: offline)
            let session = try await auth.session()
            guard session.userId == role.0 else { throw ManualWeekReadFailure.configuration }
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: role.0)
            guard member.householdId == household, member.displayName == role.1 else {
                throw ManualWeekReadFailure.configuration
            }
            let api = MealAPI(http: http)
            let library = try await api.library(token: session.accessToken, member: member)
            XCTAssertNil(library.nextAfterId, "Fixture lookup must include the entire bounded library")
            let recipes = library.meals.filter { $0.title == title }
            let week = try await api.week(
                token: session.accessToken, member: member, start: MealWeekStart("2026-10-19"))
            if phase == "absent" {
                XCTAssertTrue(recipes.isEmpty && week.entries.isEmpty)
                XCTAssertEqual(count, 0)
                try record(nil, week: week, member: member, phase: phase)
                return
            }
            XCTAssertEqual(recipes.count, 1)
            let loaded = try await api.recipe(
                token: session.accessToken, member: member, id: XCTUnwrap(recipes.first?.id),
                revision: library.revision)
            let recipe = try XCTUnwrap(loaded)
            verify(recipe)
            verify(week, count: count, recipe: recipe)
            if phase == "recipe" { XCTAssertEqual(count, 0) }
            if phase == "full" { XCTAssertEqual(count, 7) }
            try record(recipe, week: week, member: member, phase: phase)
        } catch { throw ManualWeekReadFailure.read }
    }

    private func verify(_ recipe: SavedRecipe) {
        XCTAssertEqual(recipe.title, title)
        XCTAssertEqual(recipe.servings, 2)
        XCTAssertEqual(recipe.instructions, "Simmer the fictional ingredients.")
        XCTAssertNil(recipe.recipeUrl)
        XCTAssertNil(recipe.notes)
        XCTAssertEqual(recipe.ingredients.map(\.name), ["QA lentils", "QA rice"])
        XCTAssertEqual(recipe.ingredients.map(\.quantity), ["200", "100"])
        XCTAssertEqual(recipe.ingredients.map(\.unit), ["g", "g"])
    }

    private func verify(_ week: MealWeekSnapshot, count: Int, recipe: SavedRecipe) {
        XCTAssertEqual(week.entries.count, count)
        XCTAssertEqual(Set(week.entries.map(\.date)), Set(week.weekStart.days.prefix(count)))
        for entry in week.entries {
            XCTAssertEqual(entry.slot, .dinner)
            let saved = entry.date.value == "2026-10-19"
            XCTAssertEqual(entry.title, saved ? title : "\(title) · \(entry.date.value)")
            XCTAssertEqual(entry.definitionId, saved ? recipe.id : nil)
            XCTAssertNil(entry.leftoverSourceId)
        }
    }

    private func record(_ recipe: SavedRecipe?, week: MealWeekSnapshot, member: VerifiedMember, phase: String) throws {
        let report: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase,
            "recipe": try recipe.map { try JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) }
                ?? NSNull(),
            "week": try JSONSerialization.jsonObject(with: JSONEncoder().encode(week)),
        ]
        let capture = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        capture.name = "Owned native manual-week readback"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func role(_ environment: [String: String]) throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            guard environment["NEST_QA_NATIVE_MANUAL_WEEK_READ"] == "20261005" else {
                throw XCTSkip("Requires explicit read-only verification of the owned native meal week.")
            }
            let roles: [String: (UUID, String)] = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!, "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!, "Test Sam"
                ),
            ]
            let result = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            guard environment["NEST_QA_MANUAL_WEEK_NAME"] == result.1 else {
                throw ManualWeekReadFailure.configuration
            }
            return result
        #else
            throw XCTSkip("Fictional native meal fixtures are forbidden on physical phones.")
        #endif
    }
}

enum ManualWeekReadFailure: Error { case configuration, read }
