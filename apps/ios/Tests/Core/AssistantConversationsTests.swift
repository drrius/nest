import Foundation
import XCTest

@testable import NestCore

final class AssistantConversationsTests: XCTestCase {
    func testPrivateConversationPageRejectsScopeDuplicatesAndReplayedCursor() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let row = AssistantConversationSummary(
            conversationId: UUID(), revision: "1", createdAt: "2026-09-28T12:00:00.123456+02:00",
            updatedAt: "2026-09-28T10:01:00Z")
        func page(actor: UUID, rows: [AssistantConversationSummary], next: UUID? = nil) -> AssistantConversationPage {
            .init(version: 1, actorId: actor, householdId: member.householdId, conversations: rows, nextCursor: next)
        }
        XCTAssertNoThrow(try page(actor: member.userId, rows: [row]).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(actor: UUID(), rows: [row]).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row, row]).validated(member: member, after: nil))
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row]).validated(member: member, after: row.id))
        XCTAssertThrowsError(
            try page(actor: member.userId, rows: [row], next: row.id).validated(member: member, after: nil))
        let foreign = VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Other")
        XCTAssertThrowsError(try page(actor: member.userId, rows: [row]).validated(member: foreign, after: nil))
    }

    func testInvalidConversationRevisionAndTimestampAreRejected() {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        for (revision, timestamp) in [("01", "2026-09-28T10:00:00Z"), ("1", "tomorrow")] {
            let row = AssistantConversationSummary(
                conversationId: UUID(), revision: revision, createdAt: timestamp, updatedAt: timestamp)
            let page = AssistantConversationPage(
                version: 1, actorId: member.userId, householdId: member.householdId,
                conversations: [row], nextCursor: nil)
            XCTAssertThrowsError(try page.validated(member: member, after: nil))
        }
    }
}
