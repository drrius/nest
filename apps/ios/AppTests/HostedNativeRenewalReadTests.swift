import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedNativeRenewalReadTests: XCTestCase {
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let original = "Nest native renewal 20261006"
    private let edited = "Nest native renewal edited 20261006"

    func testBothMembersReadOwnedRenewalCanonicalState() async throws {
        let environment = ProcessInfo.processInfo.environment
        let actor = try role(environment)
        let phase = try XCTUnwrap(environment["NEST_QA_RENEWAL_PHASE"])
        guard ["absent", "created", "edited", "removed"].contains(phase) else {
            throw ManualWeekReadFailure.configuration
        }
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("renewal-read.sqlite"))
        let auth = try NestAuth(configuration: configuration, offline: offline)
        let session = try await auth.session()
        guard session.userId == actor.0 else { throw ManualWeekReadFailure.configuration }
        let http = try NestHTTP(baseURL: configuration.apiURL)
        let member = try await ChoreAPI(http: http).verify(token: session.accessToken, expectedActor: actor.0)
        guard member.householdId == household, member.displayName == actor.1 else {
            throw ManualWeekReadFailure.configuration
        }
        let api = RenewalAPI(http: http)
        let list = try await api.list(token: session.accessToken, member: member, after: nil)
        XCTAssertNil(list.next)
        if phase == "absent" {
            XCTAssertTrue(list.renewals.isEmpty)
            XCTAssertFalse(list.renewals.contains { [original, edited].contains($0.fields.title) })
            try record(member: member, phase: phase, list: list, renewal: nil, receipt: nil)
            return
        }
        let id = try XCTUnwrap(UUID(uuidString: try XCTUnwrap(environment["NEST_QA_RENEWAL_ID"])))
        let detail = try await api.detail(token: session.accessToken, member: member, id: id)
        let renewal = detail.renewal
        try verify(renewal, phase: phase, environment: environment)
        XCTAssertEqual(list.renewals.map(\.id), phase == "removed" ? [] : [id])
        if phase != "removed" { XCTAssertEqual(list.renewals.first, renewal) }
        let receipt = try await recordedReceipt(
            api: api, token: session.accessToken, member: member, renewal: renewal, environment: environment)
        try record(member: member, phase: phase, list: list, renewal: renewal, receipt: receipt)
    }

    private func verify(_ renewal: CalendarRenewal, phase: String, environment: [String: String]) throws {
        XCTAssertEqual(renewal.fields.title, phase == "created" ? original : edited)
        XCTAssertEqual(renewal.removed, phase == "removed")
        XCTAssertEqual(renewal.fields.noticeDays, 0)
        XCTAssertNil(renewal.fields.responsibleId)
        XCTAssertNil(renewal.fields.recurringRuleId)
        XCTAssertEqual(renewal.cancellationOn, renewal.fields.renewalOn)
        XCTAssertEqual(renewal.fields.renewalOn.value, try XCTUnwrap(environment["NEST_QA_RENEWAL_DATE"]))
        XCTAssertEqual(renewal.revision.uuidString.lowercased(), try XCTUnwrap(environment["NEST_QA_RENEWAL_REVISION"]))
    }

    private func recordedReceipt(
        api: RenewalAPI, token: String, member: VerifiedMember, renewal: CalendarRenewal,
        environment: [String: String]
    ) async throws -> RenewalReceipt? {
        guard let value = environment["NEST_QA_RENEWAL_OPERATION"] else { return nil }
        let operation = try XCTUnwrap(UUID(uuidString: value))
        let baseline = environment["NEST_QA_RENEWAL_BASELINE_REVISION"].flatMap(UUID.init(uuidString:))
        let command = RenewalCommand(
            operationId: operation, renewalId: renewal.id, expectedRevision: baseline,
            fields: renewal.removed ? nil : renewal.fields)
        let recovered = try await api.recover(token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.status, .recorded)
        let receipt = try XCTUnwrap(recovered.receipt)
        XCTAssertEqual(receipt.renewal, renewal)
        return receipt
    }

    private func record(
        member: VerifiedMember, phase: String, list: RenewalList, renewal: CalendarRenewal?, receipt: RenewalReceipt?
    ) throws {
        let encoder = JSONEncoder()
        let rows = try list.renewals.map { try JSONSerialization.jsonObject(with: encoder.encode($0)) }
        let value: Any = try renewal.map { try JSONSerialization.jsonObject(with: encoder.encode($0)) } ?? NSNull()
        let recovered: Any = try receipt.map { try JSONSerialization.jsonObject(with: encoder.encode($0)) } ?? NSNull()
        let data: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": household.uuidString.lowercased(),
            "displayName": member.displayName, "phase": phase, "renewals": rows, "renewal": value,
            "retainedHistoryVisibleInList": false, "receipt": recovered,
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Owned renewal canonical native SDK read"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func role(_ environment: [String: String]) throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            guard environment["NEST_QA_NATIVE_RENEWAL_READ"] == "20261006" else {
                throw XCTSkip("Requires explicit read-only verification of the owned fictional renewal.")
            }
            let roles: [String: (UUID, String)] = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!, "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!, "Test Sam"
                ),
            ]
            let value = try XCTUnwrap(roles[try XCTUnwrap(environment["SIMULATOR_UDID"])])
            guard environment["NEST_QA_RENEWAL_NAME"] == value.1 else { throw ManualWeekReadFailure.configuration }
            return value
        #else
            throw XCTSkip("Fictional renewal fixtures are forbidden on physical phones.")
        #endif
    }
}
