import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedMealReminderNavigationReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let entry = UUID(uuidString: "f040105f-89b5-4370-aa2f-636c7c284be1")!
    private let definition = UUID(uuidString: "1f5b84c0-8ecb-4f5d-ad33-0a60088b239b")!
    private let title = "Nest native manual week 20261005"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyExactOwnedPlannedMealReminderAndRetainedWeek() async throws {
        let role = try authorized()
        let (http, member, token) = try await authenticated(role)
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first(where: { $0.actorId == alex })?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first(where: { $0.actorId == sam })?.displayName, "Test Sam")
        let api = MealAPI(http: http)
        let week = try await api.week(token: token, member: member, start: MealWeekStart("2026-10-19"))
        let target = try XCTUnwrap(week.entries.first(where: { $0.id == entry }))
        XCTAssertEqual(target.title, title)
        XCTAssertEqual(target.date.value, "2026-10-19")
        XCTAssertEqual(target.slot, .dinner)
        XCTAssertEqual(target.definitionId, definition)
        let planned = try await api.plannedRecipe(token: token, member: member, week: week, id: entry)
        XCTAssertEqual(planned.entry, target)
        XCTAssertEqual(try XCTUnwrap(planned.snapshot).recipe.definitionId, definition)
        let context = try await NotificationAPI(http: http).mealReminder(token: token, member: member, id: entry)
        XCTAssertEqual(context.meal, target)
        try compareBaseline(context, week: week, planned: planned)
        let settings = context.reminder?.settings ?? MealReminderModel.defaults
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "context": try json(context), "editorSettings": try json(settings), "roster": try json(roster.members),
            "week": try json(week), "planned": try json(planned), "domainHTTPMethods": ["GET"], "hostedCommands": 0,
        ]
        let capture = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        capture.name = "Exact owned planned meal reminder canonical and retained week"
        capture.lifetime = .keepAlways
        add(capture)
    }

    private func compareBaseline(
        _ context: MealReminderContext, week: MealWeekSnapshot, planned: PlannedRecipeEnvelope
    ) throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["NEST_QA_MEAL_REMINDER_BASELINE_JSON"] else { return }
        let data = try XCTUnwrap(raw.data(using: .utf8))
        let values = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let expected = try XCTUnwrap(values)
        func decode<T: Decodable>(_ key: String, as: T.Type) throws -> T {
            let value = try XCTUnwrap(expected[key])
            return try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: value))
        }
        XCTAssertEqual(context, try decode("context", as: MealReminderContext.self))
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
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("meal-reminder-read.sqlite"))
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
            guard env["NEST_QA_MEAL_REMINDER_READ"] == "20261006" else {
                throw XCTSkip("Requires dated existing planned meal reminder read-only preflight.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_MEAL_REMINDER_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_MEAL_ENTRY_ID"], entry.uuidString.lowercased())
            return role
        #else
            throw XCTSkip("Fictional meal reminder reads are forbidden on physical phones.")
        #endif
    }
}
