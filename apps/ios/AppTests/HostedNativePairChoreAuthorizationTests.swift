import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedNativePairChoreAuthorizationTests: XCTestCase {
    func testOriginalSenderCannotAcceptTheirOutgoingRequest() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["NEST_QA_CHORE_PAIR_DENIAL"] == "20261005" else {
            throw XCTSkip("Requires the exact owned pending native handover authorization fixture.")
        }
        #if targetEnvironment(simulator)
            guard environment["SIMULATOR_UDID"] == "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A" else {
                throw ChorePairDenialFailure.fixture
            }
            let configuration = try NestConfiguration.fromBundle()
            guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
                configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
                !configuration.pushEnabled
            else { throw ChorePairDenialFailure.fixture }
            let actor = UUID(uuidString: "791f7261-6c9d-4061-9c8a-57aa6e0b0200")!
            let partner = UUID(uuidString: "e5f80cfd-b69a-4aa0-a267-75784e943676")!
            let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
            let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("denial.sqlite"))
            let auth = try NestAuth(configuration: configuration, offline: offline)
            let session = try await auth.session()
            guard session.userId == actor else { throw ChorePairDenialFailure.fixture }
            let http = try NestHTTP(baseURL: configuration.apiURL)
            let api = ChoreAPI(http: http)
            let member = try await api.verify(token: session.accessToken, expectedActor: actor)
            guard member.householdId == household, member.displayName == "Test Alex" else {
                throw ChorePairDenialFailure.fixture
            }
            let page = try await api.snapshot(token: session.accessToken, member: member)
            let rows = page.transfers.filter { $0.title == "Nest native chore pair 20261005" }
            guard rows.count == 1, let pending = rows.first,
                pending.fromMemberId == actor, pending.toMemberId == partner
            else { throw ChorePairDenialFailure.fixture }
            let command = RespondChoreTransfer(operationId: UUID(), requestId: pending.requestId, action: .accept)
            do {
                _ = try await http.write(
                    "v1/chores/transfers/respond", token: session.accessToken, household: household,
                    body: command, as: UnauthorizedChorePairReply.self)
                XCTFail("The real server accepted a sender's unauthorized handover decision.")
                throw ChorePairDenialFailure.accepted
            } catch { XCTAssertEqual(error as? NestAPIFailure, .forbidden) }
        #else
            throw XCTSkip("Fictional native pair tests are forbidden on physical phones.")
        #endif
    }
}

private enum ChorePairDenialFailure: Error { case fixture, accepted }
private struct UnauthorizedChorePairReply: Decodable {}
