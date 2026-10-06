import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedActiveRecurringReminderReceiptReadTests: XCTestCase {
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let ruleId = UUID(uuidString: "f854e3a3-ffda-4eb7-86e5-d3933d938444")!
    private let revision = UUID(uuidString: "528417a1-b97a-4be4-9e63-ad7c8c03c2be")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testGETOnlyNilBeforeAndCompleteExtendedBaseline() async throws {
        try await readProof(phase: "before")
    }

    func testGETOnlyRecordedReminderAndBothImmutableOperations() async throws {
        try await readProof(phase: "saved")
    }

    private func readProof(phase: String) async throws {
        let role = try authorized(phase: phase)
        let (http, member, token) = try await authenticated(role)
        let original = try originalRequest()
        let money = MoneyAPI(http: http)
        let pages = try await rulePages(money, token: token, member: member)
        let rows = pages.flatMap(\.rules)
        XCTAssertEqual(rows.count, 8)
        let rule = try await money.recurringRule(token: token, member: member, ruleId: ruleId).rule
        XCTAssertEqual(rows.filter { $0.id == ruleId }, [rule])
        try assertOriginalRule(rule, original: original)
        let canonical = try await completeBaseline(http, token: token, member: member, pages: pages)
        try compareExtended(canonical, phase: phase, actor: role.0)
        let api = NotificationAPI(http: http)
        let context = try await api.recurringReminder(token: token, member: member, id: ruleId)
        XCTAssertEqual(context.rule, rule)
        var reminderRecovery: RecurringReminderRecovery?
        if phase == "before" {
            XCTAssertNil(context.reminder)
        } else {
            let saved = try expectedRequest(rule: rule)
            let recovered = try await api.recoverRecurringReminder(
                token: token, member: member, command: saved.command, cancel: false)
            try assertReminder(context, saved: saved, recovery: recovered, member: member)
            reminderRecovery = recovered
        }
        let originalRecovery = try await money.recoverRecurring(
            token: token, member: member, command: original.command, cancel: false)
        XCTAssertEqual(originalRecovery.actorId, role.0)
        XCTAssertEqual(originalRecovery.householdId, household)
        XCTAssertEqual(originalRecovery.operationId, original.command.operationId)
        if role.0 == alex {
            XCTAssertEqual(originalRecovery, original.result)
        } else {
            XCTAssertEqual(originalRecovery.status, .unresolved)
            XCTAssertNil(originalRecovery.receipt)
        }
        let record: [String: Any] = [
            "actor": role.0.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "phase": phase, "canonical": canonical, "rule": try json(rule), "reminder": try json(context),
            "originalRuleRecovery": try json(originalRecovery), "reminderOperationRecovery": try json(reminderRecovery),
            "historyComplete": true, "historyEventCount": 62, "hostedCommands": 0,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Active bill reminder canonical baseline and both private immutable operations"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func completeBaseline(
        _ http: NestHTTP, token: String, member: VerifiedMember, pages: [RecurringList]
    ) async throws -> [String: Any] {
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        XCTAssertEqual(Set(roster.members.map(\.actorId)), Set([alex, sam]))
        XCTAssertEqual(roster.members.first { $0.actorId == alex }?.displayName, "Test Alex")
        XCTAssertEqual(roster.members.first { $0.actorId == sam }?.displayName, "Test Sam")
        let money = MoneyAPI(http: http)
        let history = try await historyPages(money, token: token, member: member)
        XCTAssertEqual(history.flatMap(\.events).count, 62)
        let balance = try await money.balance(token: token, member: member)
        XCTAssertEqual(balance.members.first { $0.actorId == alex }?.centimes.value, 1)
        XCTAssertEqual(balance.members.first { $0.actorId == sam }?.centimes.value, -1)
        let originals = pages.flatMap(\.rules).filter { $0.id != ruleId }
        XCTAssertEqual(originals.count, 7)
        XCTAssertEqual(originals.filter { $0.status == .paused }.count, 4)
        XCTAssertEqual(originals.filter { $0.status == .cancelled }.count, 3)
        let common: [String: Any] = [
            "roster": [
                "version": roster.version, "householdId": roster.householdId.uuidString,
                "members": try json(roster.members),
            ],
            "originalRules": try json(originals), "balance": try json(balance), "historyPages": try json(history),
        ]
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_ORIGINAL_BASELINE_JSON"])
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertTrue(
            NSDictionary(dictionary: common).isEqual(to: expected), "Original complete financial baseline changed")
        var extended = common
        extended["allRulePages"] = try json(pages)
        extended["knownRemovedRenewalHistory"] = try await removedHistory(http, token: token, member: member)
        return extended
    }

    private func removedHistory(_ http: NestHTTP, token: String, member: VerifiedMember) async throws -> [Any] {
        var contexts: [Any] = []
        for id in ["17919246-d8ec-4402-b301-da1149d1cc35", "23435fe5-5b08-48cd-b0fb-03f0e2d49690"] {
            let uuid = try XCTUnwrap(UUID(uuidString: id))
            let detail = try await RenewalAPI(http: http).detail(token: token, member: member, id: uuid).renewal
            let context = try await NotificationAPI(http: http).renewalReminder(token: token, member: member, id: uuid)
            XCTAssertEqual(context.renewalId, uuid)
            XCTAssertTrue(detail.removed)
            contexts.append(["renewal": try json(detail), "reminder": try json(context.reminder)])
        }
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_REMOVED_HISTORY_JSON"])
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [Any])
        XCTAssertTrue(NSArray(array: contexts).isEqual(to: expected), "Known removed renewal/reminder history changed")
        return contexts
    }

    private func compareExtended(_ canonical: [String: Any], phase: String, actor: UUID) throws {
        let env = ProcessInfo.processInfo.environment
        guard let raw = env["NEST_QA_ACTIVE_BILL_EXTENDED_BASELINE_JSON"] else {
            guard phase == "before", actor == alex,
                env["NEST_QA_ACTIVE_BILL_CAPTURE"] == "establish_extended_before_snapshot"
            else { throw NestAPIFailure.configuration }
            return
        }
        let expected = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        XCTAssertTrue(
            NSDictionary(dictionary: canonical).isEqual(to: expected), "All eight rules or retained history changed")
    }

    private func originalRequest() throws -> SavedRecurring {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_ORIGINAL_REQUEST_JSON"])
        let saved = try JSONDecoder().decode(SavedRecurring.self, from: Data(raw.utf8))
        _ = try saved.command.validated(member: .init(userId: alex, householdId: household, displayName: "Test Alex"))
        XCTAssertEqual(saved.command.operationId.uuidString.lowercased(), "5bdfcaeb-3f20-4fa3-9db9-0f0902eede8f")
        XCTAssertEqual(saved.command.rule.ruleId, ruleId)
        XCTAssertEqual(saved.result?.status, .recorded)
        XCTAssertFalse(saved.cancellationRequested)
        return saved
    }

    private func assertOriginalRule(_ rule: RecurringRule, original: SavedRecurring) throws {
        XCTAssertEqual(rule.id, ruleId)
        XCTAssertEqual(rule.revision, revision)
        XCTAssertEqual(rule.status, .active)
        XCTAssertEqual(rule.authorizedBy, alex)
        XCTAssertEqual(rule.configuration, original.command.rule.configuration)
        XCTAssertEqual(rule.nextDueOn?.value, "2026-11-01")
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_RULE_JSON"])
        XCTAssertEqual(rule, try JSONDecoder().decode(RecurringRule.self, from: Data(raw.utf8)))
    }

    private func expectedRequest(rule: RecurringRule) throws -> SavedRecurringReminderRequest {
        let raw = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_REMINDER_REQUEST_JSON"])
        let saved = try JSONDecoder().decode(SavedRecurringReminderRequest.self, from: Data(raw.utf8))
        _ = try saved.validated(member: .init(userId: alex, householdId: household, displayName: "Test Alex"))
        let object = try XCTUnwrap(try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Any])
        let command = try XCTUnwrap(object["command"] as? [String: Any])
        XCTAssertTrue(command["expectedRevision"] is NSNull)
        XCTAssertEqual(saved.baseline.rule, rule)
        XCTAssertNil(saved.baseline.reminder)
        XCTAssertEqual(saved.command.ruleId, ruleId)
        XCTAssertEqual(saved.command.expectedRuleRevision, revision)
        XCTAssertEqual(saved.command.expectedDueOn.value, "2026-11-01")
        XCTAssertNil(saved.command.expectedRevision)
        XCTAssertTrue(saved.command.settings.enabled)
        XCTAssertEqual(Set(saved.command.settings.recipientIds), Set([alex, sam]))
        XCTAssertEqual(saved.command.settings.localTime, "09:00")
        XCTAssertEqual(saved.command.settings.daysBefore, 1)
        XCTAssertFalse(saved.cancellationRequested)
        let op = try XCTUnwrap(ProcessInfo.processInfo.environment["NEST_QA_ACTIVE_BILL_REMINDER_OPERATION_ID"])
        XCTAssertEqual(saved.command.operationId, try XCTUnwrap(UUID(uuidString: op)))
        let result = try XCTUnwrap(saved.result)
        XCTAssertEqual(result.status, .recorded)
        _ = try XCTUnwrap(result.receipt)
        return saved
    }

    private func assertReminder(
        _ context: RecurringReminderContext, saved: SavedRecurringReminderRequest,
        recovery: RecurringReminderRecovery, member: VerifiedMember
    ) throws {
        let reminder = try XCTUnwrap(context.reminder)
        XCTAssertEqual(reminder.ruleId, ruleId)
        XCTAssertEqual(reminder.reviewedRuleRevision, revision)
        XCTAssertEqual(reminder.reviewedDueOn.value, "2026-11-01")
        XCTAssertEqual(reminder.updatedBy, alex)
        XCTAssertEqual(reminder.settings, saved.command.settings)
        XCTAssertEqual(reminder, try XCTUnwrap(saved.result?.receipt).reminder)
        XCTAssertEqual(recovery.actorId, member.userId)
        XCTAssertEqual(recovery.householdId, household)
        XCTAssertEqual(recovery.operationId, saved.command.operationId)
        if member.userId == alex {
            XCTAssertEqual(recovery.status, .recorded)
            let receipt = try XCTUnwrap(recovery.receipt)
            XCTAssertEqual(receipt.reminder, reminder)
            XCTAssertEqual(receipt.command, saved.command)
            XCTAssertEqual(recovery, try XCTUnwrap(saved.result))
        } else {
            XCTAssertEqual(recovery.status, .unresolved)
            XCTAssertNil(recovery.receipt)
        }
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
        let store = try ChoreOfflineStore(
            url: directory.appendingPathComponent("active-bill-reminder-receipt-read.sqlite"))
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

    private func authorized(phase: String) throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let env = ProcessInfo.processInfo.environment
            guard env["NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_READ"] == "20261006" else {
                throw XCTSkip(
                    "Requires exact dated active bill reminder nil preflight or immutable saved receipt reads.")
            }
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (alex, "Test Alex"),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (sam, "Test Sam"),
            ]
            let role = try XCTUnwrap(roles[try XCTUnwrap(env["SIMULATOR_UDID"])])
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_NAME"], role.1)
            XCTAssertEqual(env["NEST_QA_ACTIVE_BILL_REMINDER_RECEIPT_PHASE"], phase)
            XCTAssertTrue(["before", "saved"].contains(phase))
            return role
        #else
            throw XCTSkip("Fictional recurring reminder reads are forbidden on physical phones.")
        #endif
    }
}
