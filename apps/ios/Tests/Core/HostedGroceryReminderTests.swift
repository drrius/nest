import Foundation
import XCTest

@testable import NestCore

final class HostedGroceryReminderTests: XCTestCase {
    func testFictionalReminderIsolationReplayAndCancellation() async throws {
        let env = ProcessInfo.processInfo.environment
        guard env["NEST_TEST_API_URL"] == "https://nest-test-api-drrius-projects.vercel.app",
            env["NEST_TEST_ALLOW_GROCERY_REMINDER"] == "1",
            let actor = env["NEST_TEST_ACTOR_ID"].flatMap(UUID.init(uuidString:)),
            let path = env["NEST_TEST_MEMBER_TOKEN_FILE"], let outsiderPath = env["NEST_TEST_OUTSIDER_TOKEN_FILE"]
        else { throw XCTSkip("Explicit isolated fictional reminder credentials required") }
        let token = try String(contentsOfFile: path, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)
        let outsider = try String(contentsOfFile: outsiderPath, encoding: .utf8).trimmingCharacters(
            in: .whitespacesAndNewlines)
        let http = try NestHTTP(baseURL: URL(string: env["NEST_TEST_API_URL"]!)!)
        let groceries = GroceryAPI(http: http)
        let api = NotificationAPI(http: http)
        let member = try await groceries.verify(token: token, expectedActor: actor)
        let roster = try await ChoreAPI(http: http).routineRoster(token: token, member: member)
        guard roster.members.count == 2, roster.members.allSatisfy({ $0.displayName.hasPrefix("Test ") }) else {
            throw XCTSkip("Fictional household required")
        }
        let create = try AddGrocery(
            operationId: UUID(), itemId: UUID(), name: "Synthetic reminder " + UUID().uuidString,
            quantity: nil, unit: nil, categoryId: nil)
        do {
            _ = try await groceries.add(token: token, member: member, command: create)
            try await verify(api: api, token: token, outsider: outsider, member: member, id: create.itemId)
        } catch {
            try await cleanup(id: create.itemId, api: groceries, token: token, member: member)
            throw error
        }
        try await cleanup(id: create.itemId, api: groceries, token: token, member: member)
    }

    private func cleanup(id: UUID, api: GroceryAPI, token: String, member: VerifiedMember) async throws {
        let list = try await api.list(token: token, member: member)
        if let item = list.groceries.first(where: { $0.id == id }) {
            _ = try await api.remove(
                token: token, member: member, item: item,
                command: RemoveGrocery(item: item, operationId: UUID()))
        }
        let after = try await api.list(token: token, member: member)
        XCTAssertFalse(after.groceries.contains { $0.id == id }, "Fictional reminder grocery remains")
    }

    private func verify(api: NotificationAPI, token: String, outsider: String, member: VerifiedMember, id: UUID)
        async throws
    {
        let baseline = try await api.groceryReminder(token: token, member: member, id: id)
        XCTAssertNil(baseline.reminder)
        let settings = DatedReminderSettings(
            enabled: true, recipientIds: [member.userId], localDate: try CivilDate("2099-02-01"), localTime: "08:00")
        let command = SaveGroceryReminder(
            operationId: UUID(), itemId: id,
            expectedItemVersion: baseline.itemVersion, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.groceryReminder(token: outsider, member: member, id: id)
            XCTFail("Outsider read household reminder")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        do {
            _ = try await api.saveGroceryReminder(token: outsider, member: member, command: command)
            XCTFail("Outsider changed recipient consent")
        } catch { XCTAssertTrue((error as? NestAPIFailure) == .forbidden || (error as? NestAPIFailure) == .notMember) }
        let receipt = try await api.saveGroceryReminder(token: token, member: member, command: command)
        let replay = try await api.saveGroceryReminder(token: token, member: member, command: command)
        XCTAssertEqual(replay, receipt)
        let recovered = try await api.recoverGroceryReminder(
            token: token, member: member, command: command, cancel: false)
        XCTAssertEqual(recovered.receipt, receipt)
        let changed = SaveGroceryReminder(
            operationId: UUID(), itemId: id,
            expectedItemVersion: baseline.itemVersion, expectedRevision: nil, settings: settings)
        do {
            _ = try await api.saveGroceryReminder(token: token, member: member, command: changed)
            XCTFail("Stale reminder revision overwrote choices")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let cancelled = try await api.recoverGroceryReminder(
            token: token, member: member, command: changed, cancel: true)
        XCTAssertEqual(cancelled.status, .cancelled)
        do {
            _ = try await api.saveGroceryReminder(token: token, member: member, command: changed)
            XCTFail("Cancelled reminder request was recorded")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        var disabled = settings
        disabled.enabled = false
        let off = SaveGroceryReminder(
            operationId: UUID(), itemId: id,
            expectedItemVersion: baseline.itemVersion,
            expectedRevision: receipt.reminder.revision, settings: disabled)
        let offReceipt = try await api.saveGroceryReminder(token: token, member: member, command: off)
        let current = try await api.groceryReminder(token: token, member: member, id: id)
        XCTAssertEqual(current.reminder, offReceipt.reminder)
        XCTAssertFalse(try XCTUnwrap(current.reminder).settings.enabled)
    }
}
