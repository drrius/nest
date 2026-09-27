import Foundation
import XCTest

@testable import NestCore

final class HostedGroceryAddIntegrationTests: XCTestCase {
    func testIsolatedHostedAddEditReplayOutsiderDenialAndCleanup() async throws {
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
            let original = try XCTUnwrap(list.groceries.first { $0.id == command.itemId })
            let edit = try EditGrocery(
                item: original, operationId: UUID(), name: "Nest SwiftUI fictional edited test",
                quantity: original.quantity, unit: original.unit, categoryId: nil)
            do {
                _ = try await api.edit(
                    token: outsiderToken, member: member, item: original, command: edit)
                XCTFail("Outsider edited another household's grocery")
            } catch {
                XCTAssertTrue((error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
            }
            let edited = try await api.edit(
                token: memberToken, member: member, item: original, command: edit)
            let editReplay = try await api.edit(
                token: memberToken, member: member, item: original, command: edit)
            XCTAssertEqual(editReplay, edited)
            let updatedList = try await api.list(token: memberToken, member: member)
            XCTAssertEqual(
                updatedList.groceries.first { $0.id == command.itemId }?.name,
                "Nest SwiftUI fictional edited test")
            try await removeFixture(
                command.itemId, api: api, token: memberToken,
                outsiderToken: outsiderToken, member: member)
        } catch {
            _ = try? await api.add(token: memberToken, member: member, command: command)
            try? await removeFixture(
                command.itemId, api: api, token: memberToken,
                outsiderToken: outsiderToken, member: member)
            XCTFail("Hosted add or cleanup failed for fictional item \(command.itemId): \(error)")
            throw error
        }
    }

    private func token(at path: String) throws -> String {
        try String(contentsOfFile: path, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func removeFixture(
        _ item: UUID, api: GroceryAPI, token: String,
        outsiderToken: String, member: VerifiedMember
    ) async throws {
        let list = try await api.list(token: token, member: member)
        guard let current = list.groceries.first(where: { $0.id == item }) else { return }
        let command = RemoveGrocery(item: current, operationId: UUID())
        do {
            _ = try await api.remove(
                token: outsiderToken, member: member, item: current, command: command)
            XCTFail("Outsider removed another household's grocery")
        } catch {
            XCTAssertTrue((error as? NestAPIFailure) == .notMember || (error as? NestAPIFailure) == .forbidden)
        }
        let result = try await api.remove(token: token, member: member, item: current, command: command)
        let replay = try await api.remove(token: token, member: member, item: current, command: command)
        XCTAssertEqual(replay, result)
        let after = try await api.list(token: token, member: member)
        XCTAssertFalse(after.groceries.contains { $0.id == item })
    }
}
