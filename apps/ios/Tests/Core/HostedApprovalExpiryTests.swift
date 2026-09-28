import Foundation
import XCTest

@testable import NestCore

final class HostedApprovalExpiryTests: XCTestCase {
    func testExpiredFixtureAndOutsiderDenial() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated test credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let member = try await MealAPI(http: http).verify(token: token, expectedActor: actor)
        guard member.displayName.hasPrefix("Test ") else { throw XCTSkip("Fictional member required") }
        let api = MoneyAPI(http: http)
        guard let approval = env["NEST_TEST_EXPIRY_APPROVAL"].flatMap(UUID.init(uuidString:)),
            let operation = env["NEST_TEST_EXPIRY_OPERATION"].flatMap(UUID.init(uuidString:))
        else { throw XCTSkip("Dedicated expired fixture required") }
        let result = try await api.approvalExpiry(
            token: token, member: member,
            approvalId: approval, operationId: operation, command: .expense)
        XCTAssertTrue(result.expiredUnused)
        let replay = try await api.approvalExpiry(
            token: token, member: member,
            approvalId: approval, operationId: operation, command: .expense)
        XCTAssertTrue(replay.expiredUnused)
        do {
            _ = try await api.approvalExpiry(
                token: outsider, member: member,
                approvalId: approval, operationId: operation, command: .expense)
            XCTFail("Outsider read expiry evidence")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
    }
}
