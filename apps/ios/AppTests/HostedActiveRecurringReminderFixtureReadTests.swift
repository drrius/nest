import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedActiveRecurringReminderFixtureReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let title = "Nest QA reminder bill 0610-5d1a"

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyCompleteBaselineOrExactCreatedVariableRule() async throws {
        let (role, phase) = try authorized()
        let (http, member, token) = try await authenticated(role)
        let money = MoneyAPI(http: http)
        let pages = try await rulePages(money, token: token, member: member)
        let rows = pages.flatMap(\.rules)
        let saved = try expectedRequest(phase)
        let owned = saved?.command.rule.ruleId
        let originals = rows.filter { $0.id != owned }
        XCTAssertEqual(originals.count, 7)
        XCTAssertEqual(originals.filter { $0.status == .paused }.count, 4)
        XCTAssertEqual(originals.filter { $0.status == .cancelled }.count, 3)
        XCTAssertFalse(originals.contains { $0.status == .active })
        XCTAssertFalse(originals.contains { $0.configuration.description == title })
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first { $0.actorId == alex }?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first { $0.actorId == sam }?.displayName, "Test Sam")
        let history = try await historyPages(money, token: token, member: member)
        XCTAssertEqual(history.flatMap(\.events).count, 62)
        let balance = try await money.balance(token: token, member: member)
        XCTAssertEqual(Set(balance.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(balance.members.first { $0.actorId == alex }?.centimes.value, 1)
        XCTAssertEqual(balance.members.first { $0.actorId == sam }?.centimes.value, -1)
        let canonical: [String: Any] = [
            "roster": [
                "version": roster.version, "householdId": roster.householdId.uuidString,
                "members": try json(roster.members),
            ],
            "originalRules": try json(originals), "balance": try json(balance), "historyPages": try json(history),
        ]
        try compareBaseline(canonical, actor: role.0, phase: phase)
        var rule: RecurringRule?
        var reminder: RecurringReminderContext?
        var recovered: RecurringRecovery?
        if let saved {
            let detail = try await money.recurringRule(token: token, member: member, ruleId: saved.command.rule.ruleId)
            rule = detail.rule
            try assertCreated(detail.rule, saved: saved)
            XCTAssertEqual(rows.count, 8)
            XCTAssertEqual(rows.filter { $0.id == saved.command.rule.ruleId }, [detail.rule])
            reminder = try await NotificationAPI(http: http).recurringReminder(
                token: token, member: member, id: detail.rule.id)
            XCTAssertEqual(reminder?.rule, detail.rule)
            XCTAssertNil(reminder?.reminder)
            recovered = try await money.recoverRecurring(token: token, member: member, command: saved.command)
            XCTAssertEqual(recovered?.actorId, role.0)
            XCTAssertEqual(recovered?.householdId, household)
            if role.0 == alex {
                XCTAssertTrue(
                    NSDictionary(dictionary: try json(try XCTUnwrap(recovered)) as! [String: Any]).isEqual(
                        to: try json(try XCTUnwrap(saved.result)) as! [String: Any]))
                XCTAssertEqual(recovered?.status, .recorded)
            } else {
                XCTAssertEqual(recovered?.status, .unresolved)
                XCTAssertNil(recovered?.receipt)
            }
        } else {
            XCTAssertEqual(rows.count, 7)
        }
        let record: [String: Any] = [
            "actor": role.0.uuidString.lowercased(), "household": household.uuidString.lowercased(), "phase": phase,
            "canonical": canonical, "rulePages": try json(pages), "rule": try json(rule),
            "reminder": try json(reminder), "recovery": try json(recovered), "historyComplete": true,
            "historyEventCount": 62, "hostedCommands": 0,
            "baselineComparisonPerformed": ProcessInfo.processInfo.environment[
                "NEST_QA_RECURRING_FIXTURE_BASELINE_JSON"] != nil,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Active variable fixture native baseline and immutable receipt"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func expectedRequest(_ phase: String) throws -> SavedRecurring? {
        guard phase == "created" else { return nil }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_RECURRING_FIXTURE_REQUEST_JSON"])
        let saved = try JSONDecoder().decode(SavedRecurring.self, from: Data(raw.utf8))
        let owner = VerifiedMember(userId: alex, householdId: household, displayName: "Test Alex")
        try saved.command.rule.validated(member: owner)
        _ = try saved.result?.validated(member: owner, command: saved.command)
        XCTAssertFalse(saved.cancellationRequested)
        XCTAssertEqual(saved.result?.status, .recorded)
        XCTAssertNil(saved.command.rule.expectedRevision)
        XCTAssertEqual(saved.command.rule.firstDueOn.value, "2026-11-01")
        let config = saved.command.rule.configuration
        XCTAssertEqual(config.description, title)
        XCTAssertEqual(config.mode, .variable)
        XCTAssertEqual(config.payerId, alex)
        XCTAssertEqual(config.startDate.value, "2026-11-01")
        XCTAssertEqual(config.schedule.kind, .monthly)
        XCTAssertEqual(config.schedule.dayOfMonth, 1)
        XCTAssertNil(config.schedule.weekday)
        XCTAssertNil(config.amountCentimes)
        XCTAssertNil(config.allocations)
        XCTAssertNil(config.categoryId)
        XCTAssertNil(config.note)
        XCTAssertNil(saved.result?.receipt?.approvalId)
        return saved
    }

    private func assertCreated(_ rule: RecurringRule, saved: SavedRecurring) throws {
        let receipt = try XCTUnwrap(saved.result?.receipt)
        XCTAssertEqual(rule.id, saved.command.rule.ruleId)
        XCTAssertEqual(rule.revision, receipt.revision)
        XCTAssertEqual(rule.configuration, saved.command.rule.configuration)
        XCTAssertEqual(rule.status, .active)
        XCTAssertEqual(rule.authorizedBy, alex)
        XCTAssertEqual(rule.nextDueOn?.value, "2026-11-01")
        XCTAssertNil(rule.coveredThrough)
    }

    private func compareBaseline(_ canonical: [String: Any], actor: UUID, phase: String) throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["NEST_QA_RECURRING_FIXTURE_BASELINE_JSON"] else {
            guard actor == alex, phase == "baseline",
                env["NEST_QA_RECURRING_FIXTURE_CAPTURE"] == "establish_original_baseline"
            else {
                throw NestAPIFailure.configuration
            }
            return
        }
        let data = try XCTUnwrap(raw.data(using: .utf8))
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(
            NSDictionary(dictionary: canonical).isEqual(to: expected),
            "The original seven rules, roster or complete financial baseline changed")
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
        let store = try ChoreOfflineStore(url: directory.appendingPathComponent("active-variable-rule-read.sqlite"))
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
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value), options: [.fragmentsAllowed])
    }

    private func authorized() throws -> ((UUID, String), String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_RECURRING_FIXTURE_READ"] == "20261006" else {
                throw XCTSkip("Requires dated GET-only active variable fixture baseline or receipt scope.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_RECURRING_FIXTURE_TITLE"], title)
            let phase = try XCTUnwrap(env["NEST_QA_RECURRING_FIXTURE_PHASE"])
            XCTAssertTrue(["baseline", "created"].contains(phase))
            return (role, phase)
        #else
            throw XCTSkip("Fictional recurring fixture reads are forbidden on physical phones.")
        #endif
    }
}
