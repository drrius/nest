import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedRecipeCancelDraftReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let entry = UUID(uuidString: "f040105f-89b5-4370-aa2f-636c7c284be1")!
    private let definition = UUID(uuidString: "1f5b84c0-8ecb-4f5d-ad33-0a60088b239b")!
    private let title = "Nest native manual week 20261005"

    func testGETOnlyCurrentOwnedRecipeLibraryAndCapturedWeek() async throws {
        let role = try authorized()
        let (http, member, token) = try await authenticated(role)
        let api = MealAPI(http: http)
        let library = try await api.library(token: token, member: member)
        XCTAssertNil(library.nextAfterId, "Owned fictional library must be complete within its bounded page")
        XCTAssertEqual(library.meals.filter { $0.title == title }.map(\.id), [definition])
        let loaded = try await api.recipe(token: token, member: member, id: definition, revision: library.revision)
        let recipe = try XCTUnwrap(loaded)
        XCTAssertEqual(recipe.id, definition)
        XCTAssertEqual(recipe.title, title)
        let week = try await api.week(token: token, member: member, start: MealWeekStart("2026-10-19"))
        let planned = try await api.plannedRecipe(token: token, member: member, week: week, id: entry)
        XCTAssertEqual(try XCTUnwrap(planned.entry).definitionId, definition)
        XCTAssertEqual(try XCTUnwrap(planned.snapshot).recipe.definitionId, definition)
        try compareBaseline(library, recipe: recipe, week: week, planned: planned)
        let listing: [String: Any] = [
            "version": library.version, "householdId": library.householdId.uuidString,
            "revision": library.revision, "meals": try json(library.meals), "nextAfterId": NSNull(),
        ]
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "library": listing, "recipe": try json(recipe), "week": try json(week), "planned": try json(planned),
            "domainHTTPMethods": ["GET"], "hostedCommands": 0,
        ]
        let capture = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        capture.name = "Current owned recipe library and retained planned snapshot"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func compareBaseline(
        _ library: MealLibraryPage, recipe: SavedRecipe, week: MealWeekSnapshot, planned: PlannedRecipeEnvelope
    ) throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["NEST_QA_RECIPE_CANCEL_BASELINE_JSON"] else { return }
        let data = try XCTUnwrap(raw.data(using: .utf8))
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        func decode<T: Decodable>(_ key: String, as: T.Type) throws -> T {
            let value = try XCTUnwrap(expected[key])
            return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: value))
        }
        XCTAssertEqual(library, try decode("library", as: MealLibraryPage.self))
        XCTAssertEqual(recipe, try decode("recipe", as: SavedRecipe.self))
        XCTAssertEqual(week, try decode("week", as: MealWeekSnapshot.self))
        XCTAssertEqual(planned, try decode("planned", as: PlannedRecipeEnvelope.self))
    }

    private func authenticated(_ role: (UUID, String)) async throws -> (NestHTTP, VerifiedMember, String) {
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("recipe-cancel-read.sqlite"))
        let auth = try NestAuth(configuration: config, offline: store)
        let credentials = try await auth.session()
        guard credentials.userId == role.0 else { throw ManualWeekReadFailure.configuration }
        let http = try NestHTTP(baseURL: config.apiURL) { request in
            guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app"
            else { throw NestAPIFailure.configuration }
            return try await URLSession.shared.data(for: request, delegate: NoRedirects())
        }
        let member = try await ChoreAPI(http: http).verify(token: credentials.accessToken, expectedActor: role.0)
        guard member.householdId == household, member.displayName == role.1 else {
            throw ManualWeekReadFailure.configuration
        }
        return (http, member, credentials.accessToken)
    }

    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    private func authorized() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RECIPE_CANCEL_READ"] == "20261006" else {
                throw XCTSkip("Requires dated existing planned recipe cancellation read-only preflight.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_RECIPE_CANCEL_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_RECIPE_CANCEL_ENTRY_ID"], entry.uuidString.lowercased())
            return role
        #else
            throw XCTSkip("Fictional recipe cancellation reads are forbidden on physical phones.")
        #endif
    }
}
