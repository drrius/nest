import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedVariableBillLostReplyTests: XCTestCase {
    private let title = "Nest lost-reply variable bill 20261007"
    private let alex = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
    private let sam = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!

    override func setUp() {
        super.setUp()
        continueAfterFailure = false
    }

    func testPrepareVariableOnlyRuleOnceWithoutPostingMoney() async throws {
        let (api, member, token) = try await context("prepare", actor: alex)
        let balance = try await api.balance(token: token, member: member)
        let rules = try await api.recurringRules(token: token, member: member, after: nil)
        XCTAssertFalse(rules.rules.contains { $0.configuration.description == title })
        let id = try identifier("NEST_QA_RULE")
        let config = RecurringConfiguration(
            description: title, payerId: sam, categoryId: nil, note: "Fictional interrupted bill acceptance",
            startDate: rules.today,
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: Int(rules.today.value.suffix(2))),
            mode: .variable, amountCentimes: nil, allocations: nil)
        let input = RecurringInput(ruleId: id, expectedRevision: nil, configuration: config, firstDueOn: rules.today)
        let receipt = try await api.saveRecurring(
            token: token, member: member, command: .init(operationId: identifier("NEST_QA_OPERATION"), rule: input))
        let after = try await api.balance(token: token, member: member)
        XCTAssertEqual(after.eventCount, balance.eventCount)
        XCTAssertEqual(after.members.map(\.centimes), balance.members.map(\.centimes))
        try attach([
            "rule": id.uuidString.lowercased(), "revision": receipt.revision.uuidString.lowercased(),
            "due": rules.today.value, "title": title,
        ])
    }

    func testPartnerReadsOneRecordedBillAndCoveredCycle() async throws {
        let (api, member, token) = try await context("read", actor: sam)
        let id = try identifier("NEST_QA_RULE")
        let rule = try await api.recurringRule(token: token, member: member, ruleId: id)
        XCTAssertEqual(rule.rule.configuration.description, title)
        XCTAssertFalse(rule.rule.isDue(on: rule.today))
        let event = try identifier("NEST_QA_EVENT")
        let detail = try await api.detail(token: token, member: member, eventId: event)
        XCTAssertEqual(detail.event.description, title)
        XCTAssertEqual(detail.event.amountCentimes.value, 2)
        XCTAssertEqual(detail.shares.count, 2)
        XCTAssertTrue(detail.shares.allSatisfy { $0.allocatedCentimes?.value == 1 })
        XCTAssertEqual(detail.shares.reduce(Int64(0), { $0 + $1.deltaCentimes.value }), 0)
        try attach([
            "rule": id.uuidString.lowercased(), "event": event.uuidString.lowercased(),
            "covered": rule.rule.coveredThrough?.value ?? "", "title": title,
        ])
    }

    func testCancelOnlyOwnedRuleKeepingRecordedHistory() async throws {
        let (api, member, token) = try await context("cancel", actor: alex)
        let id = try identifier("NEST_QA_RULE")
        let rule = try await api.recurringRule(token: token, member: member, ruleId: id)
        XCTAssertEqual(rule.rule.configuration.description, title)
        let before = try await api.balance(token: token, member: member)
        let receipt = try await api.saveRecurringState(
            token: token, member: member,
            command: .init(
                operationId: identifier("NEST_QA_OPERATION"),
                change: .init(
                    ruleId: id, expectedRevision: rule.rule.revision, expectedStatus: .active, action: .cancel)))
        XCTAssertEqual(receipt.status, .cancelled)
        let after = try await api.balance(token: token, member: member)
        XCTAssertEqual(before.eventCount, after.eventCount)
        XCTAssertEqual(before.members.map(\.centimes), after.members.map(\.centimes))
    }

    private func context(_ action: String, actor: UUID) async throws -> (MoneyAPI, VerifiedMember, String) {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_QA_VARIABLE_LOST_REPLY"] == "20261007", env["NEST_QA_ACTION"] == action else {
            throw XCTSkip("Requires the exact owned hosted variable-bill action")
        }
        #if targetEnvironment(simulator)
            guard
                env["SIMULATOR_UDID"]
                    == (actor == alex ? "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" : "CA0BCEDE-A297-493A-8921-9E31F8B65783")
            else {
                throw VariableLostReplyFixtureFailure.configuration
            }
        #else
            throw XCTSkip("Fictional bill fixtures are forbidden on phones")
        #endif
        guard env["NEST_QA_POSITIVE_BUDGET"] == (action == "read" ? "0" : "1") else {
            throw VariableLostReplyFixtureFailure.configuration
        }
        let config = try NestConfiguration.fromBundle()
        guard config.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            config.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co", !config.pushEnabled
        else { throw VariableLostReplyFixtureFailure.configuration }
        let path = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: path, withIntermediateDirectories: true)
        addTeardownBlock { [path] in try FileManager.default.removeItem(at: path) }
        let auth = try NestAuth(
            configuration: config, offline: ChoreOfflineStore(url: path.appendingPathComponent("read.sqlite")))
        let session = try await auth.session()
        guard session.userId == actor else { throw VariableLostReplyFixtureFailure.configuration }
        let http = try NestHTTP(baseURL: config.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: actor)
        guard member.householdId == household, member.displayName == (actor == alex ? "Test Alex" : "Test Sam") else {
            throw VariableLostReplyFixtureFailure.configuration
        }
        return (MoneyAPI(http: http, storageOrigin: config.supabaseURL), member, session.accessToken)
    }

    private func identifier(_ name: String) throws -> UUID {
        try XCTUnwrap(UUID(uuidString: XCTUnwrap(ProcessInfo.processInfo.environment[name])))
    }

    private func attach(_ fields: [String: String]) throws {
        let item = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: fields, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        item.name = "Owned variable bill"
        item.lifetime = .keepAlways
        add(item)
    }
}

private enum VariableLostReplyFixtureFailure: Error { case configuration }
