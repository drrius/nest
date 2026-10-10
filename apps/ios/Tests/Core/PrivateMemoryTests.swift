import Foundation
import XCTest

@testable import NestCore

final class PrivateMemoryTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")

    func testPrivateReadRejectsForeignScopeDuplicatesAndInvalidContent() throws {
        let memory = PrivateMemory(id: UUID(), revision: "1", content: "Remember this exact text.")
        func envelope(_ items: [PrivateMemory], actor: UUID? = nil) -> PrivateMemories {
            PrivateMemories(
                version: 1, actorId: actor ?? member.userId, householdId: member.householdId, memories: items)
        }
        XCTAssertEqual(try envelope([memory]).validated(member: member).memories, [memory])
        XCTAssertThrowsError(try envelope([memory], actor: UUID()).validated(member: member))
        XCTAssertThrowsError(try envelope([memory, memory]).validated(member: member))
        XCTAssertThrowsError(
            try envelope([.init(id: UUID(), revision: "0", content: "Invalid revision")]).validated(member: member))
        XCTAssertTrue(MemoryText.valid(String(repeating: "🙂", count: 500)))
        XCTAssertFalse(MemoryText.valid(String(repeating: "🙂", count: 501)))
        XCTAssertFalse(MemoryText.valid("\u{FEFF}\u{00A0}"))
        XCTAssertFalse(MemoryText.valid("Text\0"))
    }

    func testApprovalRequiresExactIdentityAndValidPayload() throws {
        let id = UUID()
        func envelope(_ revision: String, actor: UUID? = nil) -> MemoryApprovalEnvelope {
            MemoryApprovalEnvelope(
                version: 1, actorId: actor ?? member.userId, householdId: member.householdId,
                approval: MemoryApproval(
                    id: id, operationId: UUID(),
                    change: MemoryChange(memoryId: UUID(), expectedRevision: revision, content: "Exact text"),
                    status: .pending, expiresAt: "2099-01-01T00:00:00.123456+02:00"))
        }
        XCTAssertEqual(try envelope("0").validated(member: member, id: id).approval.change.content, "Exact text")
        XCTAssertThrowsError(try envelope("0").validated(member: member, id: UUID()))
        XCTAssertThrowsError(try envelope("0", actor: UUID()).validated(member: member, id: id))
        XCTAssertThrowsError(try envelope("01").validated(member: member, id: id))
    }
}
