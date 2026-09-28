import Foundation
import XCTest

@testable import NestCore

final class HostedApprovalReadTests: XCTestCase {
    func testPrivateInboxReadAndOutsiderDenial() async throws {
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
        let page = try await api.pendingApprovals(token: token, member: member, after: nil)
        XCTAssertEqual(page.actorId, actor)
        XCTAssertEqual(page.householdId, member.householdId)
        do {
            _ = try await api.pendingApprovals(token: outsider, member: member, after: nil)
            XCTFail("Outsider read private approval inbox")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.expenseApproval(token: outsider, member: member, approvalId: UUID())
            XCTFail("Outsider passed approval authorization")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
    }
}
