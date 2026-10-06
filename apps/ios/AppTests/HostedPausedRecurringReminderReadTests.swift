import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedPausedRecurringReminderReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let ruleId = UUID(uuidString: "06146b4a-95e5-4227-a562-5aebacceea6d")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyOriginalPausedReminderAndCompleteFinancialBaseline() async throws {
        let (role, expected) = try authorized()
        let (http, member, token) = try await authenticated(role)
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first { $0.actorId == alex }?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first { $0.actorId == sam }?.displayName, "Test Sam")
        let money = MoneyAPI(http: http)
        let pages = try await rulePages(money, token: token, member: member)
        let rule = try XCTUnwrap(pages.flatMap(\.rules).first { $0.id == ruleId })
        XCTAssertEqual(rule, expected)
        XCTAssertEqual(rule.status, .paused)
        let context = try await NotificationAPI(http: http).recurringReminder(token: token, member: member, id: ruleId)
        XCTAssertEqual(context.rule, rule)
        _ = try context.reminder?.settings.validated(members: roster.members.map(\.actorId))
        let balance = try await money.balance(token: token, member: member)
        XCTAssertEqual(Set(balance.members.map(\.actorId)), Set([alex, sam]))
        let history = try await historyPages(money, token: token, member: member)
        let events = history.flatMap(\.events)
        XCTAssertEqual(Set(events.map(\.id)).count, events.count)
        let canonical: [String: Any] = [
            "roster": [
                "version": roster.version, "householdId": roster.householdId.uuidString,
                "members": try json(roster.members),
            ],
            "rulePages": try json(pages), "context": try json(context),
            "balance": try json(balance), "historyPages": try json(history),
        ]
        try compareBaseline(canonical)
        let record: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "displayName": member.displayName, "canonical": canonical, "historyComplete": true,
            "historyEventCount": events.count, "domainHTTPMethods": ["GET"], "hostedCommands": 0,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Original paused rule reminder and complete native money read baseline"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func compareBaseline(_ canonical: [String: Any]) throws {
        guard let raw = ProcessInfo.processInfo.environment["NEST_QA_PAUSED_RECURRING_CANONICAL_JSON"] else { return }
        let data = try XCTUnwrap(raw.data(using: .utf8))
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(
            NSDictionary(dictionary: canonical).isEqual(to: expected),
            "The native canonical rule, reminder, roster or financial baseline changed")
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
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("paused-recurring-read.sqlite"))
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

    private func authorized() throws -> ((UUID, String), RecurringRule) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_PAUSED_RECURRING_REMINDER_READ"] == "20261006" else {
                throw XCTSkip("Requires dated GET-only original paused rule reminder verification.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_PAUSED_RECURRING_NAME"], role.1)
            let raw = try XCTUnwrap(env["NEST_QA_PAUSED_RECURRING_RULE_JSON"])
            let expected = try JSONDecoder().decode(RecurringRule.self, from: Data(raw.utf8))
            XCTAssertEqual(expected.id, ruleId)
            XCTAssertEqual(expected.configuration.description, "Synthetic native manual-link QA")
            XCTAssertEqual(expected.status, .paused)
            XCTAssertEqual(expected.nextDueOn?.value, "2026-10-11")
            return (role, expected)
        #else
            throw XCTSkip("Fictional paused rule reminder reads are forbidden on physical phones.")
        #endif
    }
}
