import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedManualRecipeEditReadTests: XCTestCase {
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let definition = UUID(uuidString: "1f5b84c0-8ecb-4f5d-ad33-0a60088b239b")!
    private let entry = UUID(uuidString: "f040105f-89b5-4370-aa2f-636c7c284be1")!
    private let title = "Nest native manual week 20261005"

    func testBothMembersReadLibraryEditAndImmutablePlan() async throws {
        let environment = ProcessInfo.processInfo.environment
        let actor = try role(environment)
        let phase = try XCTUnwrap(environment["NEST_QA_MANUAL_RECIPE_EDIT_PHASE"])
        XCTAssertTrue(["original", "edited"].contains(phase))
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("recipe-read.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: offline)
        let session = try await auth.session()
        guard session.userId == actor.0 else { throw ManualWeekReadFailure.configuration }
        let http = try NestHTTP(baseURL: configuration.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: actor.0)
        guard member.householdId == household, member.displayName == actor.1 else {
            throw ManualWeekReadFailure.configuration
        }
        let api = MealAPI(http: http)
        let library = try await api.library(token: session.accessToken, member: member)
        XCTAssertNil(library.nextAfterId)
        XCTAssertEqual(library.meals.filter { $0.title == title }.map(\.id), [definition])
        let loaded = try await api.recipe(
            token: session.accessToken, member: member, id: definition, revision: library.revision)
        let recipe = try XCTUnwrap(loaded)
        XCTAssertEqual(recipe.instructions, instructions(phase))
        let week = try await api.week(token: session.accessToken, member: member, start: MealWeekStart("2026-10-19"))
        XCTAssertEqual(week.revision, "9")
        XCTAssertEqual(week.entries.count, 7)
        XCTAssertTrue(week.entries.allSatisfy { $0.slot == .dinner })
        let planned = try await api.plannedRecipe(token: session.accessToken, member: member, week: week, id: entry)
        let captured = try XCTUnwrap(planned.snapshot?.recipe)
        XCTAssertEqual(captured.definitionId, definition)
        XCTAssertEqual(captured.instructions, instructions("original"))
        XCTAssertEqual(captured.ingredients, recipe.ingredients)
        XCTAssertEqual(captured.title, recipe.title)
        XCTAssertEqual(captured.servings, recipe.servings)
        try record(
            member: member, phase: phase, revision: library.revision, recipe: recipe, week: week, planned: planned)
    }

    private func instructions(_ phase: String) -> String {
        phase == "edited"
            ? "Simmer the fictional ingredients. Rest before serving."
            : "Simmer the fictional ingredients."
    }

    private func record(
        member: VerifiedMember, phase: String, revision: String, recipe: SavedRecipe,
        week: MealWeekSnapshot, planned: PlannedRecipeEnvelope
    ) throws {
        let encoder = JSONEncoder()
        let data: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase, "libraryRevision": revision,
            "recipe": try JSONSerialization.jsonObject(with: encoder.encode(recipe)),
            "week": try JSONSerialization.jsonObject(with: encoder.encode(week)),
            "planned": try JSONSerialization.jsonObject(with: encoder.encode(planned)),
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned library and immutable planned recipe"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func role(_ environment: [String: String]) throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            guard environment["NEST_QA_NATIVE_MANUAL_RECIPE_EDIT_READ"] == "20261005" else {
                throw XCTSkip("Requires explicit read-only verification of the owned recipe edit.")
            }
            let roles: [String: (UUID, String)] = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!, "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!, "Test Sam"
                ),
            ]
            let value = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            guard environment["NEST_QA_MANUAL_WEEK_NAME"] == value.1 else { throw ManualWeekReadFailure.configuration }
            return value
        #else
            throw XCTSkip("Fictional recipe fixtures are forbidden on physical phones.")
        #endif
    }
}
