import Foundation
import XCTest

@testable import NestCore

final class AssistantMemoryLinkTests: XCTestCase {
    func testOnlyOwnCompletedProposalCanOpenNativeReview() {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let id = UUID()
        func part(actor: UUID, household: UUID) -> [String: AssistantJSON] {
            [
                "type": .string("tool-proposeMemory"), "state": .string("output-available"),
                "output": .object([
                    "ok": .bool(true),
                    "value": .object([
                        "version": .number(1), "actorId": .string(actor.uuidString),
                        "householdId": .string(household.uuidString),
                        "approval": .object(["id": .string(id.uuidString)]),
                    ]),
                ]),
            ]
        }
        let own = part(actor: member.userId, household: member.householdId)
        XCTAssertEqual(AssistantMemoryLink.approvalId(own, member: member), id)
        XCTAssertNil(
            AssistantMemoryLink.approvalId(part(actor: UUID(), household: member.householdId), member: member))
        XCTAssertNil(
            AssistantMemoryLink.approvalId(part(actor: member.userId, household: UUID()), member: member))
        var pending = own
        pending["state"] = .string("input-available")
        XCTAssertNil(AssistantMemoryLink.approvalId(pending, member: member))
        pending = own
        pending["type"] = .string("tool-removeMemory")
        XCTAssertNil(AssistantMemoryLink.approvalId(pending, member: member))
    }
}
