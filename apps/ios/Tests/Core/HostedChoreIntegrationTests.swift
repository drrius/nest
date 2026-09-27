import Foundation
import XCTest

@testable import NestCore

final class HostedChoreIntegrationTests: XCTestCase {
    func testIsolatedHostedMemberReadAndOutsiderDenial() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsiderToken = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let api = ChoreAPI(http: try NestHTTP(baseURL: apiURL))
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        let snapshot = try await api.snapshot(token: memberToken, member: member)
        XCTAssertEqual(snapshot.householdId, member.householdId)
        XCTAssertTrue(snapshot.members.contains { $0.actorId == actor })
        do {
            _ = try await api.verify(token: outsiderToken, expectedActor: UUID())
            XCTFail("Outsider passed member verification")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .notMember) }
        do {
            _ = try await api.snapshot(token: outsiderToken, member: member)
            XCTFail("Outsider read a household snapshot")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
        }
    }
}
