import Foundation
import XCTest

@testable import NestCore

final class HostedMoneyReadTests: XCTestCase {
    func testBalanceReadAndOutsiderDenial() async throws {
        let (api, member, token, outsider) = try await configuredRead()
        _ = try await api.balance(token: token, member: member)
        _ = try await api.categories(token: token, member: member, after: nil)
        await assertOutsiderCategories(api: api, token: outsider, member: member)
        let history = try await api.history(token: token, member: member, before: nil)
        if let event = history.events.first {
            _ = try await api.detail(token: token, member: member, eventId: event.id)
        }
        do {
            _ = try await api.detail(token: outsider, member: member, eventId: history.events.first?.id ?? UUID())
            XCTFail("Outsider read another household's entry")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
        }
        do {
            _ = try await api.balance(token: outsider, member: member)
            XCTFail("Outsider read another household's balance")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
        }
        do {
            _ = try await api.history(token: outsider, member: member, before: nil)
            XCTFail("Outsider read another household's history")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
        }
    }

    private func configuredRead() async throws -> (MoneyAPI, VerifiedMember, String, String) {
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
        return (MoneyAPI(http: http), member, token, outsider)
    }

    private func assertOutsiderCategories(api: MoneyAPI, token: String, member: VerifiedMember) async {
        do {
            _ = try await api.categories(token: token, member: member, after: nil)
            XCTFail("Outsider read another household’s categories")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember)
        }
    }

}
