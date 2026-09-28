import Foundation
import XCTest

@testable import NestCore

final class AssistantApprovalLinkTests: XCTestCase {
    func testFinancialLinkRequiresSuccessfulOutputAndMatchingPrivateScope() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let id = UUID()
        func part(actor: UUID, household: UUID, ok: Bool = true) -> [String: AssistantJSON] {
            [
                "type": .string("tool-proposeExpense"), "state": .string("output-available"),
                "output": .object([
                    "ok": .bool(ok),
                    "value": .object([
                        "actorId": .string(actor.uuidString), "householdId": .string(household.uuidString),
                        "approval": .object([
                            "id": .string(id.uuidString), "expiresAt": .string("2099-01-01T00:00:00.000000Z"),
                        ]),
                    ]),
                ]),
            ]
        }
        let valid = part(actor: member.userId, household: member.householdId)
        XCTAssertEqual(PendingFinancialApproval.assistantLink(valid, member: member)?.id, id)
        XCTAssertNil(
            PendingFinancialApproval.assistantLink(part(actor: UUID(), household: member.householdId), member: member))
        XCTAssertNil(
            PendingFinancialApproval.assistantLink(part(actor: member.userId, household: UUID()), member: member))
        XCTAssertNil(
            PendingFinancialApproval.assistantLink(
                part(actor: member.userId, household: member.householdId, ok: false), member: member))
        var incomplete = valid
        incomplete["state"] = .string("input-available")
        XCTAssertNil(PendingFinancialApproval.assistantLink(incomplete, member: member))
    }
}
