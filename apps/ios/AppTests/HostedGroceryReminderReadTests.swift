import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedGroceryReminderReadTests: XCTestCase {
    private let item = UUID(uuidString: "d24cc35d-a6ae-44c6-9780-e28f8723d44d")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testReadOnlyOwnedRiceReminderContext() async throws {
        let role = try authorized()
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("owned-reminder-read.sqlite"))
        let auth = try NestAuth(configuration: config, offline: store)
        let credentials = try await auth.session()
        guard credentials.userId == role.0 else { throw ManualWeekReadFailure.configuration }
        let http = try NestHTTP(baseURL: config.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: credentials.accessToken, expectedActor: role.0)
        guard member.householdId == household, member.displayName == role.1 else {
            throw ManualWeekReadFailure.configuration
        }
        let baseline = try await NotificationAPI(http: http).groceryReminder(
            token: credentials.accessToken, member: member, id: item)
        XCTAssertEqual(baseline.grocery.id, item)
        XCTAssertEqual(baseline.grocery.name, "QA rice")
        XCTAssertEqual(baseline.grocery.quantity, "100")
        XCTAssertEqual(baseline.grocery.unit, "g")
        XCTAssertFalse(baseline.grocery.checked)
        XCTAssertNil(baseline.reminder)
        let context = try JSONSerialization.jsonObject(with: JSONEncoder().encode(baseline))
        let record: [String: Any] = [
            "actor": role.0.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "context": context, "hostedCommands": 0,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Real owned grocery reminder read-only context"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func authorized() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_GROCERY_REMINDER_READ"] == "20261006" else {
                throw XCTSkip("Requires the dated exact owned grocery reminder read.")
            }
            let roles: [String: (UUID, String)] = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!, "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!, "Test Sam"
                ),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            guard env["NEST_QA_GROCERY_REMINDER_NAME"] == role.1,
                env["NEST_QA_GROCERY_REMINDER_ID"] == item.uuidString.lowercased()
            else { throw ManualWeekReadFailure.configuration }
            return role
        #else
            throw XCTSkip("Fictional grocery reminder reads are forbidden on physical phones.")
        #endif
    }
}
