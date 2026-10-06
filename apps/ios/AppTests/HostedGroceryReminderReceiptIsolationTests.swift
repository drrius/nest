import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedGroceryReminderReceiptIsolationTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let item = UUID(uuidString: "d24cc35d-a6ae-44c6-9780-e28f8723d44d")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyOwnerReceiptsAndPartnerIsolation() async throws {
        let role = try authorized()
        let saved = try fixture()
        let (api, member, token) = try await authenticated(role)
        let current = try await api.groceryReminder(token: token, member: member, id: item)
        XCTAssertEqual(current.grocery, saved[0].baseline.grocery)
        XCTAssertEqual(current.itemVersion, "1")
        XCTAssertEqual(current.reminder, saved[1].result?.receipt?.reminder)
        XCTAssertFalse(try XCTUnwrap(current.reminder).settings.enabled)
        var results: [GroceryReminderRecovery] = []
        for request in saved {
            let result = try await api.recoverGroceryReminder(
                token: token, member: member, command: request.command, cancel: false)
            XCTAssertEqual(result.actorId, member.userId)
            XCTAssertEqual(result.householdId, household)
            XCTAssertEqual(result.operationId, request.command.operationId)
            if member.userId == alex {
                XCTAssertEqual(result.status, .recorded)
                XCTAssertEqual(result, request.result)
            } else {
                XCTAssertEqual(member.userId, sam)
                XCTAssertEqual(result.status, .unresolved)
                XCTAssertNil(result.receipt)
            }
            results.append(result)
        }
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "context": try json(current), "recoveries": try json(results), "domainHTTPMethods": ["GET"],
            "hostedCommands": 0, "cancelRequested": false,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Real native GET-only owner and partner reminder receipt isolation"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func fixture() throws -> [SavedGroceryReminderRequest] {
        let env = ProcessInfo.processInfo.environment
        let data = Data(try XCTUnwrap(env["NEST_QA_REMINDER_ISOLATION_REQUESTS_JSON"]).utf8)
        let saved = try JSONDecoder().decode([SavedGroceryReminderRequest].self, from: data)
        XCTAssertEqual(saved.count, 2)
        let owner = VerifiedMember(userId: alex, householdId: household, displayName: "Test Alex")
        let operations = [
            UUID(uuidString: "e47d19d1-9c1b-47fd-bba3-a81af12114fc")!,
            UUID(uuidString: "e1596aa1-1812-4396-840d-2e9282baec73")!,
        ]
        for (index, request) in saved.enumerated() {
            _ = try request.validated(member: owner)
            XCTAssertEqual(request.command.operationId, operations[index])
            XCTAssertEqual(request.command.itemId, item)
            XCTAssertEqual(request.baseline.grocery.name, "QA rice")
            XCTAssertEqual(request.baseline.grocery.quantity, "100")
            XCTAssertEqual(request.baseline.grocery.unit, "g")
            XCTAssertFalse(request.baseline.grocery.checked)
            XCTAssertEqual(request.command.expectedItemVersion, "1")
            XCTAssertEqual(request.command.settings.enabled, index == 0)
            XCTAssertEqual(request.command.settings.localDate.value, "2026-10-07")
            XCTAssertEqual(request.command.settings.localTime, "08:00")
            XCTAssertEqual(Set(request.command.settings.recipientIds), Set([alex, sam]))
            XCTAssertEqual(request.result?.status, .recorded)
            XCTAssertFalse(request.cancellationRequested)
        }
        XCTAssertEqual(
            saved[1].result?.receipt?.reminder.revision,
            UUID(uuidString: "0238a099-9dd1-4ab7-8050-b4738dbf4b10"))
        return saved
    }

    private func authenticated(_ role: (UUID, String)) async throws -> (NotificationAPI, VerifiedMember, String) {
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("receipt-isolation.sqlite"))
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
        return (NotificationAPI(http: http), member, credentials.accessToken)
    }

    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    private func authorized() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_GROCERY_RECEIPT_ISOLATION"] == "20261006" else {
                throw XCTSkip("Requires dated GET-only isolation of the two existing owned reminder operations.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ID"], item.uuidString.lowercased())
            return role
        #else
            throw XCTSkip("Fictional reminder receipt isolation is forbidden on physical phones.")
        #endif
    }
}
