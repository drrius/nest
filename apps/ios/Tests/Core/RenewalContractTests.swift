import XCTest

@testable import NestCore

final class RenewalContractTests: XCTestCase {
    func testCivilDeadlineAndExactUnicodeTitleMatchServerBoundaries() throws {
        let fixtures = [
            ("2028-03-01", 1, "2028-02-29"), ("2026-01-01", 1, "2025-12-31"),
            ("2026-09-29", 0, "2026-09-29"), ("2026-01-01", 730, "2024-01-02"),
        ]
        for (date, notice, deadline) in fixtures {
            let fields = try fields(date: date, notice: notice)
            XCTAssertEqual(fields.cancellationDeadline?.value, deadline)
            XCTAssertNoThrow(try fields.validated(edited: true))
        }
        XCTAssertThrowsError(try fields(date: "0001-01-01", notice: 1).validated(edited: true))
        XCTAssertThrowsError(try fields(date: "2026-01-01", notice: 731).validated(edited: true))
        XCTAssertNoThrow(try fields(title: String(repeating: "😀", count: 160)).validated(edited: true))
        XCTAssertThrowsError(try fields(title: String(repeating: "😀", count: 161)).validated(edited: true))
        for padding in [" ", "\t", "\n", "\u{00A0}", "\u{2007}", "\u{FEFF}"] {
            XCTAssertThrowsError(try fields(title: padding + "Renewal").validated(edited: true))
        }
        XCTAssertNoThrow(try fields(title: "\u{0085}Renewal").validated(edited: true))
    }

    func testNullWireFieldsAndExactReceiptBinding() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let command = RenewalCommand(
            operationId: UUID(), renewalId: UUID(), expectedRevision: nil,
            fields: try fields())
        let data = try JSONEncoder().encode(command)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertTrue(json["expectedRevision"] is NSNull)
        let body = try XCTUnwrap(json["fields"] as? [String: Any])
        XCTAssertTrue(body["responsibleId"] is NSNull)
        XCTAssertTrue(body["recurringRuleId"] is NSNull)
        let record = CalendarRenewal(
            renewalId: command.renewalId, revision: UUID(), fields: command.fields!,
            cancellationOn: command.fields!.cancellationDeadline!, removed: false)
        let receipt = RenewalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, action: .saved, renewal: record)
        XCTAssertNoThrow(try receipt.validated(member: member, expected: command))
        let changed = RenewalCommand(
            operationId: command.operationId, renewalId: command.renewalId,
            expectedRevision: nil, fields: try fields(title: "Changed"))
        XCTAssertThrowsError(try receipt.validated(member: member, expected: changed))
        XCTAssertThrowsError(
            try receipt.validated(
                member: .init(userId: UUID(), householdId: member.householdId, displayName: "Other"), expected: command)
        )
        let removed = RenewalCommand(
            operationId: UUID(), renewalId: record.id,
            expectedRevision: record.revision, fields: nil)
        let removal = try JSONEncoder().encode(removed)
        let removalBody = try XCTUnwrap(JSONSerialization.jsonObject(with: removal) as? [String: Any])
        XCTAssertNil(removalBody["fields"])
        XCTAssertThrowsError(try receipt.validated(member: member, expected: removed))
    }

    func testListScopeOrderingRemovedStateAndTerminalRecovery() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let fields = try fields()
        let row = CalendarRenewal(
            renewalId: UUID(), revision: UUID(), fields: fields,
            cancellationOn: fields.cancellationDeadline!, removed: false)
        let valid = RenewalList(version: 1, householdId: member.householdId, after: nil, next: nil, renewals: [row])
        XCTAssertNoThrow(try valid.validated(member: member, cursor: nil))
        XCTAssertThrowsError(try valid.validated(member: member, cursor: UUID()))
        let duplicate = RenewalList(
            version: 1, householdId: member.householdId, after: nil, next: nil,
            renewals: [row, row])
        XCTAssertThrowsError(try duplicate.validated(member: member, cursor: nil))
        let command = RenewalCommand(
            operationId: UUID(), renewalId: row.id, expectedRevision: row.revision, fields: nil)
        let broken = RenewalRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: nil)
        XCTAssertThrowsError(try broken.validated(member: member, command: command))
    }

    private func fields(title: String = "Renewal", date: String = "2026-09-29", notice: Int = 30) throws
        -> CalendarRenewal.Fields
    {
        .init(
            title: title, renewalOn: try CivilDate(date), noticeDays: notice, responsibleId: nil, recurringRuleId: nil)
    }
}
