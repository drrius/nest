import Foundation
import XCTest

@testable import NestCore

final class HostedCalendarReadTests: XCTestCase {
    func testCalendarReadsAndOutsiderDenial() async throws {
        let env = ProcessInfo.processInfo.environment
        guard let url = env["NEST_TEST_API_URL"], url == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let memberPath = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials are not configured") }
        let token = try String(contentsOfFile: memberPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: url)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw NestAPIFailure.forbidden }
        let api = CalendarAPI(http: http)
        _ = try await api.consent(token: token, member: member)
        _ = try await api.snapshots(token: token, member: member)
        let day = try CivilDate("2026-09-28")
        _ = try await api.chores(token: token, member: member, day: day)
        for route in 0..<3 {
            do {
                if route == 0 {
                    _ = try await api.consent(token: outsider, member: member)
                } else if route == 1 {
                    _ = try await api.snapshots(token: outsider, member: member)
                } else {
                    _ = try await api.chores(token: outsider, member: member, day: day)
                }
                XCTFail("Outsider read another household's Calendar state")
            } catch {
                XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
            }
        }
    }
}
