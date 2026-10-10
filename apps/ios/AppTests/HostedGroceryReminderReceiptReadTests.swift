import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedGroceryReminderReceiptReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let item = UUID(uuidString: "d24cc35d-a6ae-44c6-9780-e28f8723d44d")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    func testReadOwnedCanonicalAndOwnerImmutableReceipts() async throws {
        let role = try authorized()
        let (api, member, token, chores) = try await authenticated(role)
        let roster = try await chores.routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first(where: { $0.actorId == alex })?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first(where: { $0.actorId == sam })?.displayName, "Test Sam")
        let current = try await api.groceryReminder(token: token, member: member, id: item)
        XCTAssertEqual(current.grocery.name, "QA rice")
        XCTAssertEqual(current.grocery.quantity, "100")
        XCTAssertEqual(current.grocery.unit, "g")
        XCTAssertEqual(current.itemVersion, "1")
        XCTAssertFalse(current.grocery.checked)
        let phase = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_REMINDER_RECEIPT_PHASE"])
        let saved = try expectedRequests(phase)
        if phase != "inspect" {
            if let latest = saved.last {
                XCTAssertEqual(current.reminder, latest.result?.receipt?.reminder)
            } else {
                XCTAssertNil(current.reminder)
            }
        }
        var recoveries: [GroceryReminderRecovery] = []
        if member.userId == alex {
            for request in saved {
                let recovery = try await api.recoverGroceryReminder(
                    token: token, member: member, command: request.command, cancel: false)
                if phase != "inspect" {
                    XCTAssertEqual(recovery, request.result)
                    XCTAssertEqual(recovery.status, .recorded)
                }
                recoveries.append(recovery)
            }
        }
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase, "context": try json(current), "ownerRecoveries": try json(recoveries),
            "rosterActors": roster.members.map { $0.actorId.uuidString.lowercased() }.sorted(), "hostedCommands": 0,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned grocery reminder canonical and owner immutable receipts"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func expectedRequests(_ phase: String) throws -> [SavedGroceryReminderRequest] {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_REMINDER_REQUESTS_JSON"])
        let saved = try JSONDecoder().decode([SavedGroceryReminderRequest].self, from: Data(raw.utf8))
        let counts = ["baseline": 0, "enabled": 1, "disabled": 2, "final": 2]
        if phase == "inspect" {
            XCTAssertTrue((1...2).contains(saved.count))
        } else {
            XCTAssertEqual(saved.count, try XCTUnwrap(counts[phase]))
        }
        let owner = VerifiedMember(userId: alex, householdId: household, displayName: "Test Alex")
        for (index, request) in saved.enumerated() {
            _ = try request.validated(member: owner)
            XCTAssertEqual(request.command.itemId, item)
            XCTAssertEqual(request.command.expectedItemVersion, "1")
            XCTAssertEqual(request.command.settings.localDate.value, "2026-10-07")
            XCTAssertEqual(request.command.settings.localTime, "08:00")
            XCTAssertEqual(Set(request.command.settings.recipientIds), Set([alex, sam]))
            XCTAssertEqual(request.command.settings.enabled, index == 0)
            if phase != "inspect" { XCTAssertEqual(request.result?.status, .recorded) }
            XCTAssertFalse(request.cancellationRequested)
        }
        if let first = saved.first {
            XCTAssertNil(first.baseline.reminder)
            XCTAssertNil(first.command.expectedRevision)
        }
        if saved.count == 2 && phase != "inspect" {
            XCTAssertNotEqual(saved[0].command.operationId, saved[1].command.operationId)
            XCTAssertEqual(saved[1].baseline.reminder, saved[0].result?.receipt?.reminder)
            XCTAssertEqual(saved[1].command.expectedRevision, saved[0].result?.receipt?.reminder.revision)
        }
        return saved
    }

    private func authenticated(_ role: (UUID, String)) async throws
        -> (NotificationAPI, VerifiedMember, String, ChoreAPI)
    {
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("owned-reminder-receipt.sqlite"))
        let auth = try NestAuth(configuration: config, offline: store)
        let credentials = try await auth.session()
        guard credentials.userId == role.0 else { throw ManualWeekReadFailure.configuration }
        let http = try NestHTTP(baseURL: config.apiURL)
        let chores = ChoreAPI(http: http)
        let member = try await chores.verify(token: credentials.accessToken, expectedActor: role.0)
        guard member.householdId == household, member.displayName == role.1 else {
            throw ManualWeekReadFailure.configuration
        }
        return (NotificationAPI(http: http), member, credentials.accessToken, chores)
    }

    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    private func authorized() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_GROCERY_REMINDER_RECEIPTS"] == "20261006" else {
                throw XCTSkip("Requires dated owned native reminder receipts and read-only API observations.")
            }
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_ID"], item.uuidString.lowercased())
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_GROCERY_REMINDER_NAME"], role.1)
            XCTAssertTrue(
                ["baseline", "enabled", "disabled", "final", "inspect"].contains(
                    env["NEST_QA_REMINDER_RECEIPT_PHASE"] ?? ""))
            return role
        #else
            throw XCTSkip("Fictional reminder receipt reads are forbidden on physical phones.")
        #endif
    }
}
