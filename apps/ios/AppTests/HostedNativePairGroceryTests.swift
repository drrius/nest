import Foundation
import XCTest

@testable import Nest

@MainActor
final class HostedNativePairGroceryTests: XCTestCase {
    func testOwnedNativeMemberReadsExactGroceryFixture() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["NEST_QA_PAIR_READ"] == "20261005" else {
            throw XCTSkip("Requires explicit read-only verification of the owned native pair fixture.")
        }
        #if targetEnvironment(simulator)
            let roles = [
                "C3ABC0D4-CFD4-4F23-8CC3-0E542014803A": (
                    "791f7261-6c9d-4061-9c8a-57aa6e0b0200", "Test Alex"
                ),
                "CA0BCEDE-A297-493A-8921-9E31F8B65783": (
                    "e5f80cfd-b69a-4aa0-a267-75784e943676", "Test Sam"
                ),
            ]
            let simulator = try XCTUnwrap(environment["SIMULATOR_UDID"])
            let role = try XCTUnwrap(roles[simulator])
            let actor = try XCTUnwrap(UUID(uuidString: role.0))
            let household = UUID(uuidString: "be772ffd-3ab5-41d5-8438-647a79a553da")!
            let expectedCount = try XCTUnwrap(Int(environment["NEST_QA_PAIR_FIXTURE_COUNT"] ?? ""))
            XCTAssertTrue([0, 1].contains(expectedCount))
            let configuration = try NestConfiguration.fromBundle()
            guard configuration.apiURL.absoluteString == "https://nest-test-api-drrius-projects.vercel.app",
                configuration.supabaseURL.absoluteString == "https://tkjixmujjoustdiedfmw.supabase.co",
                !configuration.pushEnabled
            else { throw PairFixtureFailure.read }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            addTeardownBlock { [directory] in try FileManager.default.removeItem(at: directory) }
            do {
                let offline = try ChoreOfflineStore(url: directory.appendingPathComponent("pair-read.sqlite"))
                let auth = try NestAuth(configuration: configuration, offline: offline)
                let session = try await auth.session()
                guard session.userId == actor else { throw PairFixtureFailure.read }
                let api = GroceryAPI(http: try NestHTTP(baseURL: configuration.apiURL))
                let member = try await api.verify(token: session.accessToken, expectedActor: actor)
                guard member.householdId == household, member.displayName == role.1 else {
                    throw PairFixtureFailure.read
                }
                let list = try await api.list(token: session.accessToken, member: member)
                let items = list.groceries.filter { $0.name == "Nest native pair grocery 20261005" }
                XCTAssertEqual(items.count, expectedCount)
                if let item = items.first {
                    XCTAssertEqual(item.version, environment["NEST_QA_PAIR_FIXTURE_VERSION"])
                    XCTAssertEqual(String(item.checked), environment["NEST_QA_PAIR_FIXTURE_CHECKED"])
                }
                try record(items, actor: actor, household: household)
            } catch { throw PairFixtureFailure.read }
        #else
            throw XCTSkip("Fictional native-pair verification is forbidden on physical devices.")
        #endif
    }

    private func record(_ items: [GroceryItem], actor: UUID, household: UUID) throws {
        let report: [String: Any] = [
            "actor": actor.uuidString.lowercased(),
            "household": household.uuidString.lowercased(),
            "fixtureCount": items.count,
            "items": items.map {
                ["id": $0.itemId.uuidString.lowercased(), "version": $0.version, "checked": $0.checked] as [String: Any]
            },
        ]
        let data = try JSONSerialization.data(withJSONObject: report, options: [.sortedKeys])
        let attachment = XCTAttachment(data: data, uniformTypeIdentifier: "public.json")
        attachment.name = "Owned native pair grocery read"
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private enum PairFixtureFailure: Error { case read }
