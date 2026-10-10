import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedRenewalOfflineReadTests: XCTestCase {
    private let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
    private let renewalId = UUID(uuidString: "17919246-d8ec-4402-b301-da1149d1cc35")!

    func testOwnedRemovedDetailAndEmptyListSurviveNativeStoreRestart() async throws {
        let actor = try role()
        let configuration = try NestConfiguration.fromBundle()
        guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
            configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
            !configuration.pushEnabled
        else { throw ManualWeekReadFailure.configuration }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("owned-renewal-read.sqlite")
        let store = try ChoreOfflineStore(url: url)
        let auth = try NestAuth(configuration: configuration, offline: store)
        let credentials = try await auth.session()
        guard credentials.userId == actor.0 else { throw ManualWeekReadFailure.configuration }
        let normalHTTP = try NestHTTP(baseURL: configuration.apiURL)
        let chores = ChoreAPI(http: normalHTTP)
        let member = try await chores.verify(token: credentials.accessToken, expectedActor: actor.0)
        guard member.householdId == household, member.displayName == actor.1 else {
            throw ManualWeekReadFailure.configuration
        }
        let gate = OwnedRenewalReadTransport(renewalId: renewalId)
        let guardedHTTP = try NestHTTP(baseURL: configuration.apiURL) { try await gate.respond($0) }
        let api = RenewalAPI(http: guardedHTTP)
        let live = SessionModel(auth: auth, chores: chores, offline: store, renewalAPI: api)
        live.status = .ready(member)
        live.lease = try await store.activate(member)
        let context = try live.renewalContext()
        let detail = try await live.loadRenewal(context, id: renewalId)
        XCTAssertTrue(detail.fresh)
        XCTAssertNil(detail.notice)
        try verify(detail.value)
        let list = try await live.loadRenewals(context, after: nil)
        XCTAssertTrue(list.fresh)
        XCTAssertTrue(list.value.renewals.isEmpty)
        XCTAssertNil(list.value.next)
        let ticket = try await store.beginRenewalRead(.detail(member, id: renewalId), lease: context.lease)
        let persisted = try await store.readRenewalSnapshot(ticket)
        let captured = try XCTUnwrap(persisted)
        await gate.makeUnavailable()
        let reopened = try ChoreOfflineStore(url: url)
        let offline = SessionModel(auth: auth, chores: chores, offline: reopened, renewalAPI: api)
        offline.status = .ready(member)
        offline.lease = try await reopened.activate(member)
        let restored = try offline.renewalContext()
        let cached = try await offline.loadRenewal(restored, id: renewalId)
        let cachedList = try await offline.loadRenewals(restored, after: nil)
        XCTAssertEqual(cached.value, detail.value)
        XCTAssertFalse(cached.fresh)
        XCTAssertTrue(cached.notice?.contains("Saved information from") == true)
        XCTAssertTrue(cachedList.value.renewals.isEmpty)
        XCTAssertFalse(cachedList.fresh)
        XCTAssertTrue(cachedList.notice?.contains("Refresh when online") == true)
        let counts = await gate.counts()
        XCTAssertEqual(counts.live, 2)
        XCTAssertEqual(counts.unavailable, 2)
        try record(member: member, detail: detail.value, captured: captured, cached: cached, list: cachedList)
    }

    private func verify(_ value: CalendarRenewal) throws {
        XCTAssertEqual(value.id, renewalId)
        XCTAssertEqual(value.revision, UUID(uuidString: "2bd612c0-3ce2-408c-8735-7b32e3ea6357"))
        XCTAssertEqual(value.fields.title, "Nest native renewal edited 20261006")
        XCTAssertEqual(value.fields.renewalOn.value, "2026-10-06")
        XCTAssertEqual(value.fields.noticeDays, 0)
        XCTAssertNil(value.fields.responsibleId)
        XCTAssertNil(value.fields.recurringRuleId)
        XCTAssertTrue(value.removed)
    }

    private func record(
        member: VerifiedMember, detail: CalendarRenewal, captured: SavedRenewalRead<CalendarRenewal>,
        cached: RenewalViewRead<CalendarRenewal>, list: RenewalViewRead<RenewalList>
    ) throws {
        let encoder = JSONEncoder()
        let data: [String: Any] = [
            "actor": member.userId.uuidString.lowercased(), "household": member.householdId.uuidString.lowercased(),
            "renewal": try JSONSerialization.jsonObject(with: encoder.encode(detail)),
            "persisted": try JSONSerialization.jsonObject(with: encoder.encode(captured)),
            "detailNotice": try XCTUnwrap(cached.notice), "listNotice": try XCTUnwrap(list.notice),
            "activeRenewalCount": list.value.renewals.count, "reopenedSQLite": true,
            "renewalTransportUnavailable": true, "physicalRadioLossVerified": false, "hostedMutations": 0,
            "sessionBootstrap": "Real authentication and API membership; test-visible ready state and lease.",
        ]
        let attachment = XCTAttachment(
            data: try JSONSerialization.data(withJSONObject: data, options: [.sortedKeys]),
            uniformTypeIdentifier: "public.json")
        attachment.name = "Native owned renewal read across SQLite restart and transport failure"
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func role() throws -> (UUID, String) {
        #if targetEnvironment(simulator)
            let environment = ProcessInfo.processInfo.environment
            guard environment["NEST_QA_NATIVE_RENEWAL_OFFLINE_READ"] == "20261006" else {
                throw XCTSkip("Requires the exact authorized read-only renewal cache check.")
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
            throw XCTSkip("Fictional renewal verification is forbidden on physical phones.")
        #endif
    }
}

private actor OwnedRenewalReadTransport {
    let renewalId: UUID
    private var unavailable = false
    private var liveReads = 0
    private var unavailableReads = 0

    init(renewalId: UUID) { self.renewalId = renewalId }
    func makeUnavailable() { unavailable = true }
    func counts() -> (live: Int, unavailable: Int) { (liveReads, unavailableReads) }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard request.httpMethod == "GET", request.url?.host == "nest-test-api-drrius-projects.vercel.app" else {
            throw NestAPIFailure.configuration
        }
        let parts = try XCTUnwrap(URLComponents(url: try XCTUnwrap(request.url), resolvingAgainstBaseURL: false))
        if parts.path == "/v1/renewals/detail" {
            guard parts.queryItems?.first(where: { $0.name == "renewalId" })?.value == renewalId.uuidString.lowercased()
            else { throw NestAPIFailure.configuration }
        } else {
            guard parts.path == "/v1/renewals", parts.query == nil else { throw NestAPIFailure.configuration }
        }
        if unavailable {
            unavailableReads += 1
            throw URLError(.notConnectedToInternet)
        }
        liveReads += 1
        return try await URLSession.shared.data(for: request, delegate: NoRedirects())
    }
}
