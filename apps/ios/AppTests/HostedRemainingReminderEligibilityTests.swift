import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedRemainingReminderEligibilityTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyExistingRecurringAndRenewalReminderEligibility() async throws {
        let role = try authorized()
        let (http, member, token) = try await authenticated(role)
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first { $0.actorId == alex }?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first { $0.actorId == sam }?.displayName, "Test Sam")
        let money = MoneyAPI(http: http)
        let recurring = try await recurringPages(money, token: token, member: member)
        let renewalAPI = RenewalAPI(http: http)
        let renewals = try await renewalPages(renewalAPI, token: token, member: member)
        let rules = recurring.flatMap(\.rules)
        let renewalRows = renewals.flatMap(\.renewals)
        let data: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "displayName": member.displayName, "domainHTTPMethods": ["GET"], "hostedCommands": 0,
            "roster": [
                "version": roster.version, "householdId": roster.householdId.uuidString,
                "members": try json(roster.members),
            ],
            "recurringPages": try json(recurring), "renewalPages": try json(renewals),
            "eligibleRecurringIds": rules.filter { $0.status == .active && $0.nextDueOn != nil }
                .map { $0.id.uuidString.lowercased() },
            "eligibleRenewalIds": renewalRows.map { $0.id.uuidString.lowercased() },
            "recurringTarget": try await recurringTarget(
                rules, http: http, money: money, token: token, member: member, roster: roster),
            "renewalTarget": try await renewalTarget(
                renewalRows, http: http, api: renewalAPI, token: token, member: member, roster: roster),
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Existing native recurring and renewal reminder eligibility GET-only"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func recurringPages(_ api: MoneyAPI, token: String, member: VerifiedMember) async throws -> [RecurringList]
    {
        var pages: [RecurringList] = []
        var cursor: UUID?
        for _ in 0..<3 {
            let page = try await api.recurringRules(token: token, member: member, after: cursor)
            pages.append(page)
            cursor = page.next
            if cursor == nil { return pages }
        }
        XCTFail("Recurring rules has no terminal cursor within the bounded three-page preflight")
        throw NestAPIFailure.contract
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
        XCTFail("Renewals has no terminal cursor within the bounded three-page preflight")
        throw NestAPIFailure.contract
    }

    private func recurringTarget(
        _ rules: [RecurringRule], http: NestHTTP, money: MoneyAPI, token: String, member: VerifiedMember,
        roster: RoutineRoster
    ) async throws -> Any {
        guard let rule = rules.first(where: { $0.status == .active && $0.nextDueOn != nil }) else {
            return NSNull()
        }
        let context = try await NotificationAPI(http: http).recurringReminder(token: token, member: member, id: rule.id)
        XCTAssertEqual(context.rule, rule)
        _ = try context.reminder?.settings.validated(members: roster.members.map(\.actorId))
        let balance = try await money.balance(token: token, member: member)
        XCTAssertEqual(Set(balance.members.map(\.actorId)), Set(roster.members.map(\.actorId)))
        let history = try await historyPages(money, token: token, member: member)
        let events = history.flatMap(\.events)
        XCTAssertEqual(Set(events.map(\.id)).count, events.count)
        return [
            "selectedRuleId": rule.id.uuidString.lowercased(), "context": try json(context),
            "balance": try json(balance), "historyPages": try json(history),
            "historyComplete": true, "historyEventCount": events.count,
        ]
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
        XCTFail("Money history has no terminal cursor within the bounded three-page preflight")
        throw NestAPIFailure.contract
    }

    private func renewalTarget(
        _ rows: [CalendarRenewal], http: NestHTTP, api: RenewalAPI, token: String, member: VerifiedMember,
        roster: RoutineRoster
    ) async throws -> Any {
        guard let renewal = rows.first else { return NSNull() }
        let detail = try await api.detail(token: token, member: member, id: renewal.id)
        XCTAssertEqual(detail.renewal, renewal)
        XCTAssertFalse(detail.renewal.removed)
        let choices = try await NotificationAPI(http: http).renewalReminder(
            token: token, member: member, id: renewal.id)
        _ = try choices.reminder?.settings.delivery.validated(members: roster.members.map(\.actorId))
        return [
            "selectedRenewalId": renewal.id.uuidString.lowercased(), "renewal": try json(detail.renewal),
            "context": try json(choices),
        ]
    }

    private func authenticated(_ role: (UUID, String)) async throws -> (NestHTTP, VerifiedMember, String) {
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("reminder-eligibility-read.sqlite"))
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
            guard env["NEST_QA_REMAINING_REMINDER_ELIGIBILITY"] == "20261006" else {
                throw XCTSkip("Requires dated read-only remaining reminder eligibility preflight.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_REMAINING_REMINDER_NAME"], role.1)
            return role
        #else
            throw XCTSkip("Fictional reminder eligibility reads are forbidden on physical phones.")
        #endif
    }
}
