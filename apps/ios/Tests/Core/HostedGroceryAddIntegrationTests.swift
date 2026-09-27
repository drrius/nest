import Foundation
import XCTest

@testable import NestCore

private struct RemoveTestGrocery: Encodable {
    let operationId: UUID
    let itemId: UUID
    let expectedVersion: String
}

private struct RemoveTestEnvelope: Decodable {
    let version: Int
    let householdId: UUID
    let receipt: GroceryWriteReceipt
}

final class HostedGroceryAddIntegrationTests: XCTestCase {
    func testIsolatedHostedAddReplayOutsiderDenialAndCleanup() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard let apiString = environment["NEST_TEST_API_URL"],
            let apiURL = URL(string: apiString),
            let actorString = environment["NEST_TEST_ACTOR_ID"],
            let actor = UUID(uuidString: actorString),
            let memberPath = environment["NEST_TEST_MEMBER_TOKEN_FILE"],
            let outsiderPath = environment["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Isolated hosted test credentials are not configured") }
        let memberToken = try token(at: memberPath)
        let outsiderToken = try token(at: outsiderPath)
        let http = try NestHTTP(baseURL: apiURL)
        let api = GroceryAPI(http: http)
        let member = try await api.verify(token: memberToken, expectedActor: actor)
        let command = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Nest SwiftUI fictional add test",
            quantity: "1", unit: "item", categoryId: nil)
        do {
            _ = try await api.add(token: outsiderToken, member: member, command: command)
            XCTFail("Outsider added to another household")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
        }
        do {
            let first = try await api.add(token: memberToken, member: member, command: command)
            let replay = try await api.add(token: memberToken, member: member, command: command)
            XCTAssertEqual(replay, first)
            let list = try await api.list(token: memberToken, member: member)
            XCTAssertEqual(list.groceries.filter { $0.id == command.itemId }.count, 1)
            try await removeFixture(
                command.itemId, http: http, api: api, token: memberToken, member: member)
        } catch {
            _ = try? await api.add(token: memberToken, member: member, command: command)
            try? await removeFixture(
                command.itemId, http: http, api: api, token: memberToken, member: member)
            XCTFail("Hosted add or cleanup failed for fictional item \(command.itemId): \(error)")
            throw error
        }
    }

    private func token(at path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func removeFixture(
        _ item: UUID, http: NestHTTP, api: GroceryAPI,
        token: String, member: VerifiedMember
    ) async throws {
        let list = try await api.list(token: token, member: member)
        guard let current = list.groceries.first(where: { $0.id == item }) else { return }
        let command = RemoveTestGrocery(
            operationId: UUID(), itemId: item, expectedVersion: current.version)
        let result = try await http.write(
            "v1/groceries/remove", token: token, household: member.householdId,
            body: command, as: RemoveTestEnvelope.self)
        XCTAssertEqual(result.version, 1)
        XCTAssertEqual(result.householdId, member.householdId)
        XCTAssertEqual(result.receipt.operation, command.operationId)
        XCTAssertEqual(result.receipt.target, item)
        XCTAssertTrue(result.receipt.removed)
        let after = try await api.list(token: token, member: member)
        XCTAssertFalse(after.groceries.contains { $0.id == item })
    }
}
