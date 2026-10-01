import Foundation
import XCTest

@testable import NestCore

final class AssistantRoutineLinkTests: XCTestCase {
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
                forResource: "assistant-routine-actions", withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode([Fixture].self, from: Data(contentsOf: url))
    }

    func testCanonicalActionsBindOwnScopeTargetAndExactMicrosecondVersions() throws {
        for fixture in try fixtures() {
            let receipt = try XCTUnwrap(AssistantRoutineLink.receipt(fixture.part, member: member))
            XCTAssertEqual(receipt.actorId, member.userId)
            XCTAssertEqual(receipt.householdId, member.householdId)
            XCTAssertEqual(receipt.routineId.uuidString.lowercased(), fixture.receipt["routineId"]?.string)
            XCTAssertEqual(receipt.version, fixture.receipt["version"]?.string)
            XCTAssertEqual(receipt.action, fixture.receipt["action"]?.string)
        }
    }

    func testForeignScopePendingFailuresPrivateNonceAndMismatchedActionHaveNoLink() throws {
        for fixture in try fixtures() {
            for key in ["actorId", "householdId", "action", "version"] {
                var receipt = fixture.receipt
                receipt[key] = .string(key == "action" ? "skip" : UUID().uuidString)
                var part = fixture.part
                part["output"] = .object(["ok": .bool(true), "value": .object(receipt)])
                XCTAssertNil(AssistantRoutineLink.receipt(part, member: member), key)
            }
            var part = fixture.part
            part["state"] = .string("input-available")
            XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
            part = fixture.part
            part["output"] = .object(["ok": .bool(false), "value": .object(fixture.receipt)])
            XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
            var input = fixture.input
            input["operationId"] = fixture.receipt["operationId"]
            part = fixture.part
            part["input"] = .object(input)
            XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
            if input["routineId"] != nil {
                input = fixture.input
                input["routineId"] = .string(UUID().uuidString)
                part["input"] = .object(input)
                XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
                input = fixture.input
                input["expectedVersion"] = .string("2026-10-01T06:00:00.000003Z")
                part["input"] = .object(input)
                XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
            }
        }
    }

    func testInvalidOrNullPatchAndWhitespaceOnlyDefinitionCannotConfirm() throws {
        let all = try fixtures()
        let edit = try XCTUnwrap(all.first { $0.type == "tool-editRoutine" })
        let patches: [[String: AssistantJSON]] = [
            [:], ["title": .null], ["title": .string("\u{FEFF}")], ["unknown": .bool(true)],
        ]
        for patch in patches {
            var input = edit.input
            input["patch"] = .object(patch)
            var part = edit.part
            part["input"] = .object(input)
            XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
        }
        let create = try XCTUnwrap(all.first)
        guard case .object(var definition) = create.input["definition"] else { return XCTFail("Missing definition") }
        definition["title"] = .string("\u{FEFF}")
        var input = create.input
        input["definition"] = .object(definition)
        var part = create.part
        part["input"] = .object(input)
        XCTAssertNil(AssistantRoutineLink.receipt(part, member: member))
    }
}
