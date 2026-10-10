import Foundation
import XCTest

@testable import NestCore

final class ReceiptAttachmentTests: XCTestCase {
    func testUnconfirmedUploadCannotAttachAndUnresolvedExpenseCannotDelete() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "receipt-attach-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let upload = try await store.stageReceiptUpload(
            data: Data(repeating: 0, count: 12), contentType: "image/jpeg", lease: lease)
        let expense = ExpenseInput(
            description: "Test", amountCentimes: try Centimes("1"),
            receiptPath: upload.input.path(household: member.householdId), receiptTotalCentimes: nil,
            payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("1"), payer: member.userId, other: UUID()),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let command = SaveExpense(operationId: UUID(), expense: expense)
        do {
            try await store.enqueueExpense(command, lease: lease)
            XCTFail("Attached an unconfirmed upload")
        } catch OfflineFailure.invalidOperation {}
        let reservation = ReceiptUploadReservation(
            version: 1, householdId: member.householdId, uploaderId: member.userId,
            uploadId: upload.input.uploadId, sha256: upload.input.sha256, bytes: 12,
            contentType: "image/jpeg", path: expense.receiptPath!, stored: true)
        try await store.confirmReceiptUpload(reservation, lease: lease)
        try await store.enqueueExpense(command, lease: lease)
        do {
            try await store.requestReceiptCleanup(lease: lease)
            XCTFail("Deleted a potentially claimed receipt")
        } catch OfflineFailure.invalidOperation {}
        do {
            try await store.finishAttachedReceipt(lease: lease)
            XCTFail("Forgot an uncertain upload")
        } catch OfflineFailure.invalidOperation {}
        try await store.reconcileExpense(
            .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, status: .cancelled, receipt: nil), lease: lease)
        try await store.requestReceiptCleanup(lease: lease)
        try await store.finishExpense(operation: command.operationId, lease: lease)
        do {
            try await store.enqueueExpense(.init(operationId: UUID(), expense: expense), lease: lease)
            XCTFail("Attached a receipt being deleted")
        } catch OfflineFailure.invalidOperation {}
    }
}
