import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedActiveRenewalReminderReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let priorRemoved = UUID(uuidString: "17919246-d8ec-4402-b301-da1149d1cc35")!
    private let statuses = ActiveRenewalGETStatuses()
    private let title = "Nest QA reminder 0610-3f88"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyFreshRenewalBaselineAndExactCreatedReceipt() async throws {
        let (role, phase) = try authorized()
        retainGETStatuses()
        let (http, member, token) = try await authenticated(role)
        let saved = try expectedRequest(phase)
        let api = RenewalAPI(http: http)
        let pages = try await renewalPages(api, token: token, member: member)
        let rows = pages.flatMap(\.renewals)
        let owned = saved?.command.renewalId
        let canonical = try await unchangedBaseline(http, token: token, member: member, rows: rows, owned: owned)
        try compareBaseline(canonical)
        var renewal: CalendarRenewal?
        var reminder: RenewalReminderEnvelope?
        var recovered: RenewalRecovery?
        if let saved {
            renewal = try await api.detail(token: token, member: member, id: saved.command.renewalId).renewal
            reminder = try await NotificationAPI(http: http).renewalReminder(
                token: token, member: member, id: saved.command.renewalId)
            try assertCreated(try XCTUnwrap(renewal), saved: saved)
            XCTAssertEqual(rows, [renewal!])
            XCTAssertNil(reminder?.reminder)
            if member.userId == alex {
                recovered = try await api.recover(token: token, member: member, command: saved.command, cancel: false)
                XCTAssertEqual(recovered, saved.result)
                XCTAssertEqual(recovered?.status, .recorded)
            }
        } else {
            XCTAssertTrue(rows.isEmpty)
            XCTAssertFalse(rows.contains { $0.fields.title == title })
        }
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase, "canonical": canonical, "renewalPages": try json(pages),
            "renewal": try json(renewal), "reminder": try json(reminder), "ownerRecovery": try json(recovered),
            "historyComplete": true, "historyEventCount": 62, "hostedCommands": 0,
            "retainedHistoricalTitleAbsenceVerified": false,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Active renewal fixture native canonical and preserved household baseline"
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
        guard let raw = ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_RENEWAL_BASELINE_JSON"] else { return }
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertTrue(NSDictionary(dictionary: canonical).isEqual(to: expected), "Original household baseline changed")
    }

    private func expectedRequest(_ phase: String) throws -> SavedRenewalCommand? {
        guard phase == "created" else { return nil }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_RENEWAL_REQUEST_JSON"])
        let request = try JSONDecoder().decode(SavedRenewalCommand.self, from: Data(raw.utf8))
        _ = try request.validated(member: .init(userId: alex, householdId: household, displayName: "Test Alex"))
        XCTAssertNil(request.baseline)
        XCTAssertNil(request.command.expectedRevision)
        XCTAssertFalse(request.cancellationRequested)
        XCTAssertEqual(request.result?.status, .recorded)
        XCTAssertNotEqual(request.command.renewalId, priorRemoved)
        return request
    }

    private func assertCreated(_ renewal: CalendarRenewal, saved: SavedRenewalCommand) throws {
        XCTAssertEqual(renewal, saved.result?.receipt?.renewal)
        XCTAssertEqual(renewal.id, saved.command.renewalId)
        XCTAssertFalse(renewal.removed)
        XCTAssertEqual(renewal.fields.title, title)
        XCTAssertEqual(renewal.fields.renewalOn.value, "2026-10-07")
        XCTAssertEqual(renewal.fields.noticeDays, 0)
        XCTAssertEqual(renewal.cancellationOn, renewal.fields.renewalOn)
        XCTAssertNil(renewal.fields.responsibleId)
        XCTAssertNil(renewal.fields.recurringRuleId)
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

    private func authorized() throws -> ((UUID, String), String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_ACTIVE_RENEWAL_READ"] == "20261006" else {
                throw XCTSkip("Requires the exact dated active-renewal phase-one read scope.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_ACTIVE_RENEWAL_TITLE"], title)
            let phase = try XCTUnwrap(env["NEST_QA_ACTIVE_RENEWAL_PHASE"])
            XCTAssertTrue(["baseline", "created"].contains(phase))
            return (role, phase)
        #else
            throw XCTSkip("Fictional active renewal reads are forbidden on physical phones.")
        #endif
    }
}

private actor ActiveRenewalGETStatuses {
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
