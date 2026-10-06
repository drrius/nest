import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedMealLeftoversJourneyReadTests: XCTestCase {
    private let sourceId = UUID(uuidString: "f040105f-89b5-4370-aa2f-636c7c284be1")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testOwnedSourceAndCrossWeekLeftoverReadOnly() async throws {
        let (actor, name, phase) = try authorized()
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw NestAPIFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("leftovers-read.sqlite"))
        let auth = try NestAuth(configuration: config, offline: store)
        let trace = LeftoversReadTrace()
        do {
            let credentials = try await auth.session()
            guard credentials.userId == actor else { throw NestAPIFailure.signedOut }
            let http = try NestHTTP(baseURL: config.apiURL) { request in
                guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app"
                else { throw NestAPIFailure.configuration }
                let (data, response) = try await URLSession.shared.data(for: request, delegate: NoRedirects())
                if let response = response as? HTTPURLResponse {
                    await trace.record(path: request.url!.path, status: response.statusCode)
                }
                return (data, response)
            }
            let api = MealAPI(http: http)
            let member = try await api.verify(token: credentials.accessToken, expectedActor: actor)
            XCTAssertEqual(member.householdId, household)
            XCTAssertEqual(member.displayName, name)
            let source = try await api.week(
                token: credentials.accessToken, member: member, start: MealWeekStart("2026-10-19"))
            let target = try await api.week(
                token: credentials.accessToken, member: member, start: MealWeekStart("2026-10-26"))
            let recipe = try await api.plannedRecipe(
                token: credentials.accessToken, member: member, week: source, id: sourceId)
            try assertSource(source, recipe: recipe)
            let copied = try await assertTarget(
                api, token: credentials.accessToken, member: member, week: target, recipe: recipe, phase: phase)
            try attach(actor: actor, phase: phase, source: source, target: target, recipe: recipe, copied: copied)
            try await attachTrace(trace)
        } catch {
            try await attachTrace(trace)
            throw error
        }
    }

    private func assertSource(_ source: MealWeekSnapshot, recipe: PlannedRecipeEnvelope) throws {
        XCTAssertEqual(source.revision, "9")
        XCTAssertEqual(source.entries.count, 7)
        let meal = try XCTUnwrap(source.entries.first { $0.id == sourceId })
        XCTAssertEqual(meal.date.value, "2026-10-19")
        XCTAssertEqual(meal.slot, .dinner)
        XCTAssertNil(meal.leftoverSourceId)
        let retained = try XCTUnwrap(recipe.snapshot)
        XCTAssertEqual(retained.libraryRevision, "37")
        XCTAssertEqual(retained.recipe.servings, 2)
        XCTAssertEqual(retained.recipe.instructions, "Simmer the fictional ingredients.")
        XCTAssertEqual(retained.recipe.ingredients.map(\.name), ["QA lentils", "QA rice"])
        XCTAssertEqual(retained.recipe.ingredients.map(\.quantity), ["200", "100"])
        XCTAssertEqual(retained.recipe.ingredients.map(\.unit), ["g", "g"])
    }

    private func assertTarget(
        _ api: MealAPI, token: String, member: VerifiedMember, week: MealWeekSnapshot,
        recipe: PlannedRecipeEnvelope, phase: String
    ) async throws -> PlannedRecipeEnvelope? {
        if phase == "before" || phase == "removed" {
            XCTAssertTrue(week.entries.isEmpty)
            XCTAssertEqual(week.revision, phase == "before" ? "0" : "2")
            return nil
        }
        XCTAssertEqual(week.revision, "1")
        XCTAssertEqual(week.entries.count, 1)
        let entry = try XCTUnwrap(week.entries.first)
        XCTAssertEqual(entry.date.value, "2026-10-26")
        XCTAssertEqual(entry.slot, .lunch)
        XCTAssertEqual(entry.leftoverSourceId, sourceId)
        XCTAssertNotEqual(entry.id, sourceId)
        XCTAssertEqual(entry.title, "Nest native manual week 20261005")
        let expected = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_LEFTOVER_ENTRY"])
        XCTAssertEqual(entry.id.uuidString.lowercased(), expected)
        let copied = try await api.plannedRecipe(token: token, member: member, week: week, id: entry.id)
        XCTAssertEqual(copied.snapshot, recipe.snapshot)
        return copied
    }

    private func authorized() throws -> (UUID, String, String) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_LEFTOVERS_READ"] == "20261007-owned-cross-week" else {
            throw XCTSkip("Explicit fictional source/leftover GET-only reads")
        }
        let roles = [
            "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": ("791f7261-6c9d-4061-9c8a-57aa6e0b0200", "Test Alex"),
            "CA0BCEDE-A297-493A-8921-9E31F8B65783": ("e5f80cfd-b69a-4aa0-a267-75784e943676", "Test Sam"),
        ]
        let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
        XCTAssertEqual(env["NEST_QA_NAME"], role.1)
        let phase = try XCTUnwrap(env["NEST_QA_LEFTOVERS_PHASE"])
        XCTAssertTrue(["before", "placed", "removed"].contains(phase))
        return (try XCTUnwrap(UUID(uuidString: role.0)), role.1, phase)
    }

    private func attach(
        actor: UUID, phase: String, source: MealWeekSnapshot, target: MealWeekSnapshot,
        recipe: PlannedRecipeEnvelope, copied: PlannedRecipeEnvelope?
    ) throws {
        let record = LeftoversJourneyRead(
            actor: actor, household: household, phase: phase, source: source, target: target, recipe: recipe,
            copied: copied)
        let attachment = XCTAttachment(data: try JSONEncoder().encode(record), uniformTypeIdentifier: "public.json")
        attachment.name = "Owned source and cross-week leftover canonical read"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func attachTrace(_ trace: LeftoversReadTrace) async throws {
        let attachment = XCTAttachment(
            data: try JSONEncoder().encode(await trace.requests), uniformTypeIdentifier: "public.json")
        attachment.name = "Safe leftovers GET status trace"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private struct LeftoversJourneyRead: Encodable {
    let actor: UUID
    let household: UUID
    let phase: String
    let source: MealWeekSnapshot
    let target: MealWeekSnapshot
    let recipe: PlannedRecipeEnvelope
    let copied: PlannedRecipeEnvelope?
}

private actor LeftoversReadTrace {
    struct Request: Encodable {
        let path: String
        let status: Int
    }
    var requests: [Request] = []
    func record(path: String, status: Int) { requests.append(.init(path: path, status: status)) }
}
