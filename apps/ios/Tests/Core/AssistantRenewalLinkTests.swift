import XCTest

@testable import NestCore

final class AssistantRenewalLinkTests: XCTestCase {
    func testExactReceiptAndScopeRequiredForActionLink() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let fields = CalendarRenewal.Fields(
            title: "Fixture", renewalOn: try CivilDate("2028-03-01"),
            noticeDays: 1, responsibleId: nil, recurringRuleId: nil)
        let command = RenewalCommand(operationId: UUID(), renewalId: UUID(), expectedRevision: nil, fields: fields)
        let receipt = RenewalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, action: .saved,
            renewal: CalendarRenewal(
                renewalId: command.renewalId, revision: UUID(), fields: fields,
                cancellationOn: fields.cancellationDeadline!, removed: false))
        let value = try JSONDecoder().decode(AssistantJSON.self, from: JSONEncoder().encode(receipt))
        var part: [String: AssistantJSON] = [
            "type": .string("tool-createRenewal"),
            "state": .string("output-available"),
            "output": .object(["ok": .bool(true), "value": value]),
        ]
        XCTAssertEqual(AssistantRenewalLink.receipt(part, member: member), receipt)
        let partner = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Partner")
        XCTAssertNil(AssistantRenewalLink.receipt(part, member: partner))
        part["type"] = .string("tool-editRenewal")
        XCTAssertNil(AssistantRenewalLink.receipt(part, member: member))
        part["type"] = .string("tool-removeRenewal")
        XCTAssertNil(AssistantRenewalLink.receipt(part, member: member))
        part["type"] = .string("tool-createRenewal")
        part["state"] = .string("input-available")
        XCTAssertNil(AssistantRenewalLink.receipt(part, member: member))
        part["state"] = .string("output-available")
        part["output"] = .object(["ok": .bool(false), "value": value])
        XCTAssertNil(AssistantRenewalLink.receipt(part, member: member))
    }

    func testStructuredNumericRoundTripPreservesExactLargeValues() throws {
        let data = Data("{\"centimes\":9007199254740993,\"parts\":[null,true,\"test\"]}".utf8)
        let value = try JSONDecoder().decode(AssistantJSON.self, from: data)
        let encoded = try JSONEncoder().encode(value)
        XCTAssertEqual(try JSONDecoder().decode(AssistantJSON.self, from: encoded), value)
        guard case .object(let fields) = value else { return XCTFail("Missing fields") }
        XCTAssertEqual(fields["centimes"], .number(Decimal(string: "9007199254740993")!))
    }
}
