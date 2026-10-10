import Foundation
import XCTest

@testable import NestCore

final class LegacyConfirmationTests: XCTestCase {
    private func fixture() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(forResource: "legacy-confirmation", withExtension: "json", subdirectory: "Fixtures"))
        return try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
    }
    private func decode<T: Decodable>(_ raw: Any, as type: T.Type) throws -> T {
        try JSONDecoder().decode(type, from: JSONSerialization.data(withJSONObject: raw))
    }
    private func receipt() throws -> LegacyConfirmationReceipt {
        try decode(XCTUnwrap(fixture()["receipt"]), as: LegacyConfirmationReceipt.self)
    }
    private func member(_ receipt: LegacyConfirmationReceipt) -> VerifiedMember {
        .init(userId: receipt.actorId, householdId: receipt.householdId, displayName: "Alex")
    }

    func testGoldenTermsAndNullableFieldsRoundTripWithoutLosingRetainedValues() throws {
        let raw = try fixture()
        let context = try decode(XCTUnwrap(raw["context"]), as: LegacyDraftContext.self)
        let receipt = try receipt()
        let owner = member(receipt)
        let command = try decode(XCTUnwrap(raw["command"]), as: SaveLegacyConfirmation.self)
        let recovery = try decode(XCTUnwrap(raw["recovery"]), as: LegacyConfirmationRecovery.self)
        _ = try context.validated(member: owner, draftId: command.input.draftId)
        _ = try receipt.validated(member: owner, command: command, review: context)
        _ = try recovery.validated(member: owner, command: command)
        let encoder = JSONEncoder()
        for (key, data) in [
            ("context", try encoder.encode(context)), ("command", try encoder.encode(command)),
            ("receipt", try encoder.encode(receipt)), ("recovery", try encoder.encode(recovery)),
        ] {
            let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? NSDictionary)
            XCTAssertEqual(encoded, try XCTUnwrap(raw[key] as? NSDictionary), key)
        }
        XCTAssertEqual(context.draft.amountCentimes?.value, 9_007_199_254_740_991)
        XCTAssertEqual(context.draft.updatedAt.value, "2026-01-01T10:00:00.123456Z")
        XCTAssertEqual(receipt.input.expense.amountCentimes.value, 101)
        XCTAssertEqual(receipt.input.expense.description, "New chosen expense")
        XCTAssertEqual(receipt.reviewed.draft.status, .pending)
        XCTAssertEqual(receipt.status, "posted")
    }

    func testReceiptRejectsOwnerOperationPrivateApprovalAndReviewedTermSubstitution() throws {
        let raw = try XCTUnwrap(fixture()["receipt"] as? [String: Any])
        let receipt = try receipt()
        let command = SaveLegacyConfirmation(operationId: receipt.operationId, input: receipt.input)
        for key in ["actorId", "householdId", "operationId", "approvalId"] {
            var changed = raw
            changed[key] = UUID().uuidString
            let value = try decode(changed, as: LegacyConfirmationReceipt.self)
            XCTAssertThrowsError(try value.validated(member: member(receipt), command: command), key)
        }
        for (key, value) in [
            ("description", "Changed retained terms"), ("status", "dismissed"),
            ("eventId", UUID().uuidString), ("ruleId", UUID().uuidString),
        ] {
            var context = try XCTUnwrap(raw["reviewed"] as? [String: Any])
            var draft = try XCTUnwrap(context["draft"] as? [String: Any])
            draft[key] = value
            context["draft"] = draft
            var changed = raw
            changed["reviewed"] = context
            let decoded = try decode(changed, as: LegacyConfirmationReceipt.self)
            XCTAssertThrowsError(
                try decoded.validated(member: member(receipt), command: command, review: receipt.reviewed), key)
        }
        for token in [
            "", String(repeating: "a", count: 63), String(repeating: "A", count: 64),
            String(repeating: "🙂", count: 32), String(repeating: "g", count: 64),
        ] {
            XCTAssertThrowsError(try LegacyReviewToken(token))
        }
        let changed = LegacyDraftContext(
            version: 1, householdId: receipt.householdId, draft: receipt.reviewed.draft,
            reviewToken: try LegacyReviewToken(String(repeating: "f", count: 64)))
        XCTAssertNotEqual(changed, receipt.reviewed)
        XCTAssertThrowsError(try changed.validated(member: member(receipt), draftId: UUID()))
    }

    func testOriginalUnsupportedTermsRemainReviewableOnlyWithAnExplicitNewExpense() throws {
        let receipt = try receipt()
        var raw = try XCTUnwrap(fixture()["context"] as? [String: Any])
        var draft = try XCTUnwrap(raw["draft"] as? [String: Any])
        draft["amountCentimes"] = NSNull()
        draft["payerId"] = NSNull()
        draft["allocations"] = ["kind": "needs_review", "reason": "invalid_split"]
        draft["occurredOn"] = ["kind": "unsupported", "reason": "non_finite", "value": "infinity"]
        raw["draft"] = draft
        let context = try decode(raw, as: LegacyDraftContext.self)
        _ = try context.validated(member: member(receipt), draftId: receipt.input.draftId)
        XCTAssertTrue(context.canDismiss)
        let roundTrip = try JSONDecoder().decode(LegacyDraftContext.self, from: JSONEncoder().encode(context))
        XCTAssertEqual(roundTrip, context)
        for status in ["posted", "dismissed"] {
            draft["status"] = status
            raw["draft"] = draft
            XCTAssertFalse(try decode(raw, as: LegacyDraftContext.self).canDismiss)
        }
        draft["status"] = "pending"
        draft["sourceKind"] = "shopping"
        draft["shoppingSessionId"] = UUID().uuidString
        raw["draft"] = draft
        XCTAssertFalse(try decode(raw, as: LegacyDraftContext.self).canDismiss)
    }

    func testSavedIntentSurvivesRestartAndAccountSwitchWithImmutableTerminalOutcome() async throws {
        let receipt = try receipt()
        let owner = member(receipt)
        let command = SaveLegacyConfirmation(operationId: receipt.operationId, input: receipt.input)
        let url = FileManager.default.temporaryDirectory.appending(path: "legacy-confirmation-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let first = try ChoreOfflineStore(url: url)
        let lease = try await first.activate(owner)
        try await first.enqueueLegacyConfirmation(command, reviewed: receipt.reviewed, lease: lease)
        do {
            try await first.enqueueLegacyConfirmation(command, reviewed: receipt.reviewed, lease: lease)
            XCTFail("Overwrote pending intent")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await first.finishLegacyConfirmation(operation: command.operationId, lease: lease)
            XCTFail("Discarded unresolved intent")
        } catch OfflineFailure.invalidOperation {}
        try await first.requestLegacyConfirmationCancellation(lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: owner.householdId, displayName: "Other"))
        let hidden = try await reopened.readLegacyConfirmation(lease: other)
        XCTAssertNil(hidden)
        let restored = try await reopened.activate(owner)
        let saved = try await reopened.readLegacyConfirmation(lease: restored)
        XCTAssertEqual(saved?.reviewed, receipt.reviewed)
        XCTAssertEqual(saved?.command, command)
        XCTAssertTrue(saved?.cancellationRequested == true)
        let result = LegacyConfirmationRecovery(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        try await reopened.reconcileLegacyConfirmation(result, lease: restored)
        let cancelled = LegacyConfirmationRecovery(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: command.operationId, status: .cancelled, receipt: nil)
        do {
            try await reopened.reconcileLegacyConfirmation(cancelled, lease: restored)
            XCTFail("Cancellation erased actual confirmation")
        } catch OfflineFailure.invalidOperation {}
        try await reopened.finishLegacyConfirmation(operation: command.operationId, lease: restored)
        let empty = try await reopened.readLegacyConfirmation(lease: restored)
        XCTAssertNil(empty)
    }

    func testRecoveryRequiresMatchingDirectReceiptAndExplicitCancellationOutcome() throws {
        let receipt = try receipt()
        let command = SaveLegacyConfirmation(operationId: receipt.operationId, input: receipt.input)
        for status in [LegacyConfirmationRecovery.Status.unresolved, .cancelled, .recorded] {
            for attached in [false, true] {
                let value = LegacyConfirmationRecovery(
                    version: 1, actorId: receipt.actorId, householdId: receipt.householdId,
                    operationId: receipt.operationId, status: status, receipt: attached ? receipt : nil)
                if attached == (status == .recorded) {
                    _ = try value.validated(member: member(receipt), command: command)
                    if status == .unresolved {
                        XCTAssertThrowsError(
                            try value.validated(member: member(receipt), command: command, cancellation: true))
                    }
                } else {
                    XCTAssertThrowsError(try value.validated(member: member(receipt), command: command))
                }
            }
        }
    }

    func testConversionRejectsAttachmentsSeparateTotalsAndForeignChosenAllocations() throws {
        let receipt = try receipt()
        let owner = member(receipt)
        let raw = try XCTUnwrap(fixture()["command"] as? [String: Any])
        for (field, value) in [
            (
                "receiptPath",
                owner.householdId.uuidString.lowercased() + "/receipts/" + UUID().uuidString.lowercased() + ".jpg"
            ),
            ("receiptTotalCentimes", "101"),
        ] {
            var input = try XCTUnwrap(raw["input"] as? [String: Any])
            var expense = try XCTUnwrap(input["expense"] as? [String: Any])
            expense[field] = value
            input["expense"] = expense
            let command = try decode(input, as: LegacyConfirmInput.self)
            XCTAssertThrowsError(try command.validated(member: owner), field)
        }
        for amount in 0..<256 {
            let total = try Centimes(String(amount))
            let partner = receipt.input.expense.allocations.first { $0.memberId != owner.userId }!.memberId
            let shares = try ExpenseSplit.equal(total, payer: owner.userId, other: partner)
            let expense = ExpenseInput(
                description: "Explicit amount", amountCentimes: total,
                receiptPath: nil, receiptTotalCentimes: nil, payerId: owner.userId, allocations: shares,
                date: receipt.input.expense.date, note: nil, categoryId: nil)
            let chosen = LegacyConfirmInput(
                draftId: receipt.input.draftId, ruleId: receipt.input.ruleId,
                reviewToken: receipt.input.reviewToken, expense: expense)
            _ = try chosen.validated(member: owner)
            XCTAssertEqual(chosen.expense.allocations.reduce(0) { $0 + $1.centimes.value }, Int64(amount))
            XCTAssertEqual(receipt.reviewed.draft.amountCentimes?.value, 9_007_199_254_740_991)
            XCTAssertThrowsError(
                try chosen.validated(
                    member: .init(userId: UUID(), householdId: owner.householdId, displayName: "Outsider")))
        }
    }

    func testRecordedEventAndChosenExpenseCannotBeReplacedInTheDurableOutcome() async throws {
        let receipt = try receipt()
        let owner = member(receipt)
        let command = SaveLegacyConfirmation(operationId: receipt.operationId, input: receipt.input)
        let url = FileManager.default.temporaryDirectory.appending(
            path: "legacy-confirmation-terminal-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(owner)
        try await store.enqueueLegacyConfirmation(command, reviewed: receipt.reviewed, lease: lease)
        let original = LegacyConfirmationRecovery(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: receipt.operationId, status: .recorded, receipt: receipt)
        try await store.reconcileLegacyConfirmation(original, lease: lease)
        var raw = try XCTUnwrap(fixture()["receipt"] as? [String: Any])
        raw["eventId"] = UUID().uuidString
        let changed = try decode(raw, as: LegacyConfirmationReceipt.self)
        _ = try changed.validated(member: owner, command: command)
        do {
            try await store.reconcileLegacyConfirmation(
                .init(
                    version: 1, actorId: owner.userId, householdId: owner.householdId,
                    operationId: receipt.operationId, status: .recorded, receipt: changed), lease: lease)
            XCTFail("Replaced a recorded event")
        } catch OfflineFailure.invalidOperation {}
        let saved = try await store.readLegacyConfirmation(lease: lease)
        XCTAssertEqual(saved?.result?.receipt?.eventId, receipt.eventId)
    }

}
