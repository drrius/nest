import Foundation
import XCTest

@testable import NestCore

final class MealPreparationTests: XCTestCase {
    func testWhitespaceTitlesMatchSharedEffectFixtures() throws {
        let fixture = try MealPreparationFixture()
        let titles = try XCTUnwrap(fixture.object["titles"] as? [[String: Any]])
        for item in titles {
            let title = try XCTUnwrap(item["title"] as? String)
            let valid = try XCTUnwrap(item["valid"] as? Bool)
            XCTAssertEqual(MealPreparationDraft.validTitle(title), valid)
        }
    }

    func testWireRoundTripAndNullableInstructionsMatchEffectFixtures() throws {
        let fixture = try MealPreparationFixture()
        for name in ["edit", "titleOnly"] {
            let value: EditMealPreparation = try fixture.decode(name)
            _ = try value.validated()
            let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? NSDictionary
            XCTAssertEqual(encoded, fixture.object[name] as? NSDictionary)
        }
        let create: CreateMealPreparation = try fixture.decode("create")
        _ = try create.validated()
        let encoded = try JSONSerialization.jsonObject(with: JSONEncoder().encode(create)) as? NSDictionary
        XCTAssertEqual(encoded, fixture.object["create"] as? NSDictionary)
        let read: MealPreparationEnvelope = try fixture.decode("read")
        _ = try read.validated(household: fixture.member.householdId, week: create.weekStart, id: create.entryId)
        XCTAssertEqual(read.revision, "9007199254740993")
    }

    func testExactMicrosecondReceiptGuardsAndForeignIdentity() throws {
        let fixture = try MealPreparationFixture()
        let command: EditMealPreparation = try fixture.decode("edit")
        for n in 0..<120 {
            let previous = String(format: "2030-01-07T12:00:00.%06dZ", n)
            let next = String(format: "2030-01-07T12:00:00.%06dZ", n + 1)
            let input = EditMealPreparation(
                operationId: command.operationId, entryId: command.entryId,
                weekStart: command.weekStart, expectedRevision: command.expectedRevision,
                routineId: command.routineId, expectedRoutineVersion: previous, patch: command.patch)
            let receipt = try fixture.receipt(version: next, previous: previous)
            XCTAssertEqual(try receipt.validated(member: fixture.member, command: input).routineVersion, next)
            XCTAssertThrowsError(
                try fixture.receipt(version: previous, previous: previous).validated(
                    member: fixture.member, command: input))
        }
        let receipt: MealPreparationReceipt = try fixture.decode("editReceipt")
        let outsider = VerifiedMember(userId: UUID(), householdId: fixture.member.householdId, displayName: "Outsider")
        XCTAssertThrowsError(try receipt.validated(member: outsider, command: command))
        let foreign = VerifiedMember(userId: fixture.member.userId, householdId: UUID(), displayName: "Other household")
        XCTAssertThrowsError(try receipt.validated(member: foreign, command: command))
    }

    func testFinishedTaskAndLegacyUnicodeChangesPreserveUnchangedFields() throws {
        let fixture = try MealPreparationFixture()
        let baseline = try fixture.read(status: "completed", title: String(repeating: "🍲", count: 120))
        var draft = MealPreparationFormDraft(baseline)
        draft.instructions = "Updated instructions."
        guard case .edit(let command) = try draft.command(operation: UUID()) else { return XCTFail("Expected edit") }
        XCTAssertNil(command.patch.title)
        XCTAssertNil(command.patch.dueOn)
        XCTAssertNil(command.patch.assignment)
        draft.dueOn = "2030-01-05"
        XCTAssertThrowsError(try draft.command(operation: UUID()))
        draft = MealPreparationFormDraft(try fixture.read(state: "archived"))
        draft.title = "Changed"
        XCTAssertThrowsError(try draft.command(operation: UUID()))
        XCTAssertThrowsError(try MealPreparationPatch().validated())
        XCTAssertFalse(MealPreparationDraft.validTitle(String(repeating: "🍲", count: 61)))
    }
}

struct MealPreparationFixture {
    let object: [String: Any]
    let member: VerifiedMember

    init() throws {
        let url = Bundle.module.url(forResource: "meal-preparation", withExtension: "json", subdirectory: "Fixtures")!
        object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let receipt = try XCTUnwrap(object["createReceipt"] as? [String: Any])
        member = VerifiedMember(
            userId: UUID(uuidString: receipt["actorId"] as! String)!,
            householdId: UUID(uuidString: receipt["householdId"] as! String)!, displayName: "Test")
    }

    func decode<T: Decodable>(_ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: JSONSerialization.data(withJSONObject: object[name]!))
    }

    func receipt(version: String, previous: String?) throws -> MealPreparationReceipt {
        var value = object["createReceipt"] as! [String: Any]
        value["routineVersion"] = version
        value["previousRoutineVersion"] = previous
        return try JSONDecoder().decode(
            MealPreparationReceipt.self, from: JSONSerialization.data(withJSONObject: value))
    }

    func read(
        status: String = "open", state: String = "active", title: String = "Soak lentils", revision: String? = nil
    ) throws -> MealPreparationEnvelope {
        var value = object["read"] as! [String: Any]
        var preparation = value["preparation"] as! [String: Any]
        preparation["status"] = status
        preparation["state"] = state
        preparation["title"] = title
        value["preparation"] = preparation
        if let revision { value["revision"] = revision }
        return try JSONDecoder().decode(
            MealPreparationEnvelope.self, from: JSONSerialization.data(withJSONObject: value))
    }
}
