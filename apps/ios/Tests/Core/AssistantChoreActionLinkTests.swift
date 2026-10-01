import Foundation
import XCTest

@testable import NestCore

final class AssistantChoreActionLinkTests: XCTestCase {
    private let member = VerifiedMember(
        userId: UUID(uuidString: "00000000-0000-4000-8000-000000000001")!,
        householdId: UUID(uuidString: "00000000-0000-4000-8000-000000000002")!, displayName: "Fixture")

    private struct Fixture: Decodable {
        let type: String
        let input: [String: AssistantJSON]
        let receipt: [String: AssistantJSON]
        var part: [String: AssistantJSON] {
            [
                "type": .string(type), "state": .string("output-available"), "input": .object(input),
                "output": .object(["ok": .bool(true), "value": .object(receipt)]),
            ]
        }
    }

    private func fixtures() throws -> [Fixture] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "assistant-chore-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testCanonicalActionsPreserveRecordedCompletionAndPendingHandoverSemantics() throws {
        for fixture in try fixtures() {
            let link = try XCTUnwrap(AssistantChoreActionLink.read(fixture.part, member: member))
            switch link {
            case .completion(let receipt):
                XCTAssertEqual(receipt.completedBy.uuidString.lowercased(), fixture.receipt["completedBy"]?.string)
                XCTAssertEqual(receipt.completedOn.value, fixture.receipt["completedOn"]?.string)
                if receipt.outcome == .alreadyCompleted {
                    XCTAssertNotEqual(receipt.completedBy, member.userId)
                    XCTAssertNotEqual(receipt.completedOn.value, fixture.input["completedOn"]?.string)
                }
            case .change(let receipt):
                XCTAssertEqual(receipt.actorId, member.userId)
                XCTAssertEqual(receipt.householdId, member.householdId)
                XCTAssertEqual(receipt.action, fixture.receipt["action"]?.string)
                XCTAssertEqual(receipt.dueDate.value, fixture.receipt["dueDate"]?.string)
            case .transfer(let receipt):
                XCTAssertEqual(receipt.actorId, member.userId)
                XCTAssertEqual(receipt.householdId, member.householdId)
                XCTAssertEqual(receipt.state, fixture.receipt["state"]?.string)
                if receipt.action == "request" { XCTAssertEqual(receipt.state, "pending") }
            }
        }
    }

    func testPendingFailedForeignScopeAndInjectedPrivateIdentityCannotOpenControls() throws {
        for fixture in try fixtures() {
            var part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
            part = fixture.part
            part["output"] = .object(["ok": .bool(false), "value": .object(fixture.receipt)])
            XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
            for key in ["operationId", "offlineEpoch"] {
                var input = fixture.input
                input[key] = .string(UUID().uuidString)
                part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
            }
            for key in ["actorId", "householdId"] where fixture.receipt[key] != nil {
                var value = fixture.receipt
                value[key] = .string(UUID().uuidString)
                part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(value)])
                XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
            }
        }
    }

    func testTargetsDatesActionsAndCompletionOwnershipCannotBeSubstituted() throws {
        for fixture in try fixtures() {
            for key in ["occurrenceId", "requestId", "recipientId"] where fixture.input[key] != nil {
                var input = fixture.input
                input[key] = .string(UUID().uuidString)
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantChoreActionLink.read(part, member: member), key)
            }
            if fixture.type == "tool-skipChore" || fixture.type == "tool-rescheduleChore" {
                var input = fixture.input
                input["expectedDueDate"] = .string("2026-10-03")
                var part = fixture.part
                part["input"] = .object(input)
                XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
                part = fixture.part
                part["type"] = .string(fixture.type == "tool-skipChore" ? "tool-rescheduleChore" : "tool-skipChore")
                XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
            }
        }
        let completed = try XCTUnwrap(fixtures().first)
        for key in ["completedBy", "completedOn", "version"] {
            var value = completed.receipt
            value[key] =
                key == "version" ? .number(2) : .string(key == "completedOn" ? "2026-10-02" : UUID().uuidString)
            var part = completed.part
            part["output"] = .object(["ok": .bool(true), "value": .object(value)])
            XCTAssertNil(AssistantChoreActionLink.read(part, member: member), key)
        }
        let reschedule = try XCTUnwrap(fixtures().first { $0.type == "tool-rescheduleChore" })
        var input = reschedule.input
        input["newDueDate"] = .null
        var value = reschedule.receipt
        value["action"] = .string("skip")
        value["status"] = .string("skipped")
        value["dueDate"] = input["expectedDueDate"]
        var part = reschedule.part
        part["input"] = .object(input)
        part["output"] = .object(["ok": .bool(true), "value": .object(value)])
        XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
        for fixture in try fixtures().filter({ $0.type == "tool-respondChoreTransfer" }) {
            input = fixture.input
            input["action"] = .string(input["action"] == .string("accept") ? "decline" : "accept")
            part = fixture.part
            part["input"] = .object(input)
            XCTAssertNil(AssistantChoreActionLink.read(part, member: member))
        }
    }
}
