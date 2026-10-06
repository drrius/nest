import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedActiveRenewalReminderRemovalReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let priorRemoved = UUID(uuidString: "17919246-d8ec-4402-b301-da1149d1cc35")!
    private let statuses = ActiveRenewalReminderRemovalGETStatuses()
    private let title = "Nest QA reminder 0610-3f88"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyRemovedRenewalRetainedReminderAndImmutableReceipts() async throws {
        let role = try authorized()
        retainGETStatuses()
        let (http, member, token) = try await authenticated(role)
        let saved = try expectedRequest()
        let removal = try expectedRemoval(saved)
        let removed = try XCTUnwrap(removal.result?.receipt?.renewal)
        let renewalAPI = RenewalAPI(http: http)
        let pages = try await renewalPages(renewalAPI, token: token, member: member)
        let rows = pages.flatMap(\.renewals)
        let canonical = try await unchangedBaseline(
            http, token: token, member: member, rows: rows, owned: saved.renewal.id)
        try compareBaseline(canonical)
        let renewal = try await renewalAPI.detail(token: token, member: member, id: saved.renewal.id).renewal
        XCTAssertEqual(renewal, removed)
        XCTAssertTrue(rows.isEmpty)
        XCTAssertTrue(renewal.removed)
        XCTAssertEqual(renewal.fields, saved.renewal.fields)
        XCTAssertEqual(renewal.cancellationOn, saved.renewal.cancellationOn)
        XCTAssertNotEqual(renewal.revision, saved.renewal.revision)
        let api = NotificationAPI(http: http)
        let envelope = try await api.renewalReminder(token: token, member: member, id: saved.renewal.id)
        let reminder = try XCTUnwrap(envelope.reminder)
        let receipt = try XCTUnwrap(saved.result?.receipt)
        XCTAssertEqual(reminder, receipt.reminder)
        let recovery = try await api.recoverRenewalReminder(
            token: token, member: member, command: saved.command, cancel: false)
        XCTAssertEqual(recovery.actorId, role.0)
        XCTAssertEqual(recovery.householdId, household)
        XCTAssertEqual(recovery.operationId, saved.command.operationId)
        if role.0 == alex {
            XCTAssertEqual(recovery, saved.result)
            XCTAssertEqual(recovery.status, .recorded)
        } else {
            XCTAssertEqual(recovery.status, .unresolved)
            XCTAssertNil(recovery.receipt)
        }
        let removedRecovery = try await renewalAPI.recover(
            token: token, member: member, command: removal.command, cancel: false)
        XCTAssertEqual(removedRecovery.actorId, role.0)
        XCTAssertEqual(removedRecovery.householdId, household)
        if role.0 == alex {
            XCTAssertEqual(removedRecovery, removal.result)
            XCTAssertEqual(removedRecovery.status, .recorded)
        } else {
            XCTAssertEqual(removedRecovery.status, .unresolved)
            XCTAssertNil(removedRecovery.receipt)
        }
        let record: [String: Any] = [
            "actor": role.0.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "canonical": canonical, "renewal": try json(renewal), "reminder": try json(envelope),
            "operationRecovery": try json(recovery), "removalRecovery": try json(removedRecovery),
            "renewalPages": try json(pages), "historyComplete": true,
            "historyEventCount": 62, "hostedCommands": 0,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned removed renewal retained reminder and immutable private receipts"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func unchangedBaseline(
        _ http: NestHTTP, token: String, member: VerifiedMember, rows: [CalendarRenewal], owned: UUID?
    ) async throws -> [String: Any] {
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first { $0.actorId == alex }?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first { $0.actorId == sam }?.displayName, "Test Sam")
        let money = MoneyAPI(http: http)
        let rules = try await rulePages(money, token: token, member: member)
        XCTAssertEqual(rules.flatMap(\.rules).count, 7)
        let history = try await historyPages(money, token: token, member: member)
        XCTAssertEqual(history.flatMap(\.events).count, 62)
        let balance = try await money.balance(token: token, member: member)
        XCTAssertEqual(Set(balance.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(balance.members.first { $0.actorId == alex }?.centimes.value, 1)
        XCTAssertEqual(balance.members.first { $0.actorId == sam }?.centimes.value, -1)
        let groceries = try await GroceryAPI(http: http).list(token: token, member: member)
        let prior = try await RenewalAPI(http: http).detail(token: token, member: member, id: priorRemoved).renewal
        XCTAssertTrue(prior.removed)
        XCTAssertEqual(prior.fields.title, "Nest native renewal edited 20261006")
        return [
            "roster": [
                "version": roster.version, "householdId": roster.householdId.uuidString,
                "members": try json(roster.members),
            ],
            "rulePages": try json(rules), "historyPages": try json(history), "balance": try json(balance),
            "groceries": try json(groceries), "priorRemovedRenewal": try json(prior),
            "originalActiveRenewals": try json(rows.filter { $0.id != owned }),
        ]
    }

    private func compareBaseline(_ canonical: [String: Any]) throws {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_RENEWAL_BASELINE_JSON"])
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertTrue(NSDictionary(dictionary: canonical).isEqual(to: expected), "Original household baseline changed")
    }

    private func expectedRequest() throws -> SavedRenewalReminderRequest {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_REMINDER_REQUEST_JSON"])
        let saved = try JSONDecoder().decode(SavedRenewalReminderRequest.self, from: Data(raw.utf8))
        _ = try saved.validated(member: .init(userId: alex, householdId: household, displayName: "Test Alex"))
        XCTAssertEqual(saved.renewal.id.uuidString.lowercased(), "23435fe5-5b08-48cd-b0fb-03f0e2d49690")
        XCTAssertEqual(saved.renewal.revision.uuidString.lowercased(), "6610131c-d4d9-42fc-89f2-42ffe0a7b777")
        XCTAssertEqual(saved.renewal.fields.title, title)
        XCTAssertEqual(saved.renewal.fields.renewalOn.value, "2026-10-07")
        XCTAssertEqual(saved.renewal.fields.noticeDays, 0)
        XCTAssertFalse(saved.renewal.removed)
        XCTAssertNil(saved.renewal.fields.responsibleId)
        XCTAssertNil(saved.renewal.fields.recurringRuleId)
        XCTAssertNil(saved.baseline.reminder)
        XCTAssertNil(saved.command.expectedRevision)
        XCTAssertEqual(saved.command.expectedRenewalRevision, saved.renewal.revision)
        XCTAssertEqual(saved.command.settings.anchor, .renewal)
        XCTAssertTrue(saved.command.settings.delivery.enabled)
        XCTAssertEqual(Set(saved.command.settings.delivery.recipientIds), Set([alex, sam]))
        XCTAssertEqual(saved.command.settings.delivery.localTime, "09:00")
        XCTAssertEqual(saved.command.settings.delivery.daysBefore, 1)
        XCTAssertFalse(saved.cancellationRequested)
        XCTAssertEqual(saved.result?.status, .recorded)
        XCTAssertEqual(saved.result?.receipt?.reminder.updatedBy, alex)
        XCTAssertEqual(saved.result?.receipt?.reminder.settings, saved.command.settings)
        return saved
    }

    private func expectedRemoval(_ reminder: SavedRenewalReminderRequest) throws -> SavedRenewalCommand {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_RENEWAL_REMOVE_REQUEST_JSON"])
        let removal = try JSONDecoder().decode(SavedRenewalCommand.self, from: Data(raw.utf8))
        _ = try removal.validated(member: .init(userId: alex, householdId: household, displayName: "Test Alex"))
        XCTAssertEqual(removal.baseline, reminder.renewal)
        XCTAssertEqual(removal.command.renewalId, reminder.renewal.id)
        XCTAssertEqual(removal.command.expectedRevision, reminder.renewal.revision)
        XCTAssertTrue(removal.command.removing)
        XCTAssertNil(removal.command.fields)
        XCTAssertFalse(removal.cancellationRequested)
        XCTAssertEqual(removal.result?.status, .recorded)
        let receipt = try XCTUnwrap(removal.result?.receipt)
        XCTAssertEqual(receipt.action, .removed)
        XCTAssertTrue(receipt.renewal.removed)
        XCTAssertEqual(receipt.renewal.fields, reminder.renewal.fields)
        return removal
    }

    private func renewalPages(_ api: RenewalAPI, token: String, member: VerifiedMember) async throws -> [RenewalList] {
        var pages: [RenewalList] = []
        var cursor: UUID?
        for _ in 0..<3 {
            let page = try await api.list(token: token, member: member, after: cursor)
            pages.append(page)
            cursor = page.next
            if cursor == nil { return pages }
        }
        XCTFail("Renewal list must reach its terminal cursor within three pages")
        throw NestAPIFailure.contract
    }

    private func rulePages(_ api: MoneyAPI, token: String, member: VerifiedMember) async throws -> [RecurringList] {
        var pages: [RecurringList] = []
        var cursor: UUID?
        for _ in 0..<3 {
            let page = try await api.recurringRules(token: token, member: member, after: cursor)
            pages.append(page)
            cursor = page.next
            if cursor == nil { return pages }
        }
        XCTFail("Recurring rules has no terminal cursor within the bounded three-page read")
        throw NestAPIFailure.contract
    }

    private func historyPages(_ api: MoneyAPI, token: String, member: VerifiedMember) async throws -> [MoneyHistory] {
        var pages: [MoneyHistory] = []
        var cursor: UUID?
        for _ in 0..<3 {
            let page = try await api.history(token: token, member: member, before: cursor)
            pages.append(page)
            cursor = page.next
            if cursor == nil { return pages }
        }
        XCTFail("Money history has no terminal cursor within the bounded three-page read")
        throw NestAPIFailure.contract
    }

    private func authenticated(_ role: (UUID, String)) async throws -> (NestHTTP, VerifiedMember, String) {
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("active-renewal-read.sqlite"))
        let auth = try NestAuth(configuration: config, offline: store)
        await statuses.setPhase("native_auth_session")
        let credentials = try await auth.session()
        guard credentials.userId == role.0 else { throw ManualWeekReadFailure.configuration }
        let log = statuses
        let http = try NestHTTP(baseURL: config.apiURL) { request in
            guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app"
            else { throw NestAPIFailure.configuration }
            let path = request.url?.path ?? "missing_path"
            await log.setPhase(path)
            let result = try await URLSession.shared.data(for: request, delegate: NoRedirects())
            let response = try XCTUnwrap(result.1 as? HTTPURLResponse)
            await log.append(path: path, status: response.statusCode)
            return result
        }
        let member = try await ChoreAPI(http: http).verify(token: credentials.accessToken, expectedActor: role.0)
        guard member.householdId == household, member.displayName == role.1 else {
            throw ManualWeekReadFailure.configuration
        }
        return (http, member, credentials.accessToken)
    }

    private func retainGETStatuses() {
        let log = statuses
        addTeardownBlock { [log] in
            let data = try JSONEncoder().encode(await log.snapshot())
            await MainActor.run {
                XCTContext.runActivity(named: "Bounded native GET status observation") { activity in
                    let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
                    attachment.name = "Bounded native GET path status and time without tokens"
                    attachment.lifetime = .keepAlways
                    activity.add(attachment)
                }
            }
        }
    }

    private func json<T: Encodable>(_ value: T) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: [.fragmentsAllowed])
    }

    private func authorized() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_ACTIVE_RENEWAL_REMINDER_REMOVAL_READ"] == "20261006" else {
                throw XCTSkip("Requires the exact dated saved renewal reminder GET-only receipt scope.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_REMINDER_REMOVAL_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_TITLE"], title)
            XCTAssertEqual(env["NEST_QA_RENEWAL_REMINDER_REMOVAL_PHASE"], "removed")
            return role
        #else
            throw XCTSkip("Fictional active renewal reads are forbidden on physical phones.")
        #endif
    }
}

private actor ActiveRenewalReminderRemovalGETStatuses {
    struct Response: Codable, Sendable {
        let path: String
        let status: Int
        let capturedAt: Double
    }
    struct Snapshot: Codable, Sendable {
        let lastPhase: String
        let responses: [Response]
    }
    private var phase = "not_started"
    private var rows: [Response] = []

    func setPhase(_ value: String) { phase = value }
    func append(path: String, status: Int) {
        rows.append(.init(path: path, status: status, capturedAt: Date().timeIntervalSince1970))
    }
    func snapshot() -> Snapshot { .init(lastPhase: phase, responses: rows) }
}
