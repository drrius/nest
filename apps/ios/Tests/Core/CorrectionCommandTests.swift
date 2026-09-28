import Foundation
import XCTest

@testable import NestCore

final class CorrectionCommandTests: XCTestCase {
    func testReversalPreservesSourceIdentityAndRejectsContradictoryReceipts() throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let input = CorrectionInput(sourceEventId: UUID(), expectedReversalId: nil, replacement: nil)
        let command = SaveCorrection(operationId: UUID(), correction: input)
        func receipt(reversal: UUID, replacement: UUID?) -> CorrectionReceipt {
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, reversalEventId: reversal,
                replacementEventId: replacement, correction: input)
        }
        _ = try receipt(reversal: UUID(), replacement: nil).validated(member: member, command: command)
        XCTAssertThrowsError(
            try receipt(reversal: input.sourceEventId, replacement: nil).validated(member: member, command: command))
        XCTAssertThrowsError(
            try receipt(reversal: UUID(), replacement: UUID()).validated(member: member, command: command))
        let data = try JSONEncoder().encode(input)
        let object = try JSONSerialization.jsonObject(with: data) as! [String: Any]
        XCTAssertTrue(object["replacement"] is NSNull)
        XCTAssertTrue(object["expectedReversalId"] is NSNull)
        XCTAssertThrowsError(
            try CorrectionInput(sourceEventId: input.sourceEventId, expectedReversalId: UUID(), replacement: nil)
                .validated(member: member))
        let opening = OpeningReplacement(
            description: "Opening correction", amountCentimes: try Centimes("101"), payerId: member.userId,
            date: try CivilDate("2026-09-28"), note: nil)
        let replacement = CorrectionReplacement.opening(opening)
        XCTAssertEqual(
            try JSONDecoder().decode(CorrectionReplacement.self, from: JSONEncoder().encode(replacement)), replacement)
    }
}
