import Foundation
import XCTest

@testable import NestCore

final class ReceiptStoreTests: XCTestCase {
    func testRestartIsolationAndCleanupRetainExactFile() async throws {
        let url = FileManager.default.temporaryDirectory.appending(path: "receipt-\(UUID()).sqlite")
        defer { try? FileManager.default.removeItem(at: url) }
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let data = Data("%PDF-1.7\nfictional receipt".utf8)
        let staged = try await store.stageReceiptUpload(data: data, contentType: "application/pdf", lease: lease)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let saved = try await reopened.readReceiptUpload(lease: active)
        XCTAssertEqual(saved?.input, staged.input)
        XCTAssertEqual(saved?.data, data)
        do {
            _ = try await reopened.stageReceiptUpload(data: data, contentType: "application/pdf", lease: active)
            XCTFail("Replaced an unresolved upload")
        } catch OfflineFailure.invalidOperation {}
        let other = try await reopened.activate(
            .init(userId: UUID(), householdId: member.householdId, displayName: "Other"))
        let absent = try await reopened.readReceiptUpload(lease: other)
        XCTAssertNil(absent)
        do {
            _ = try await reopened.readReceiptUpload(lease: active)
            XCTFail("Read with stale lease")
        } catch OfflineFailure.sessionChanged {}
        let restored = try await reopened.activate(member)
        try await reopened.requestReceiptCleanup(lease: restored)
        let pending = try await reopened.readReceiptUpload(lease: restored)
        XCTAssertEqual(pending?.cleanupRequested, true)
        let deleting = ReceiptCleanup(
            version: 1, householdId: member.householdId, uploadId: staged.input.uploadId,
            path: staged.input.path(household: member.householdId), status: .deleting)
        do {
            try await reopened.finishReceiptCleanup(deleting, lease: restored)
            XCTFail("Forgot unfinished deletion")
        } catch OfflineFailure.invalidOperation {}
        let deleted = ReceiptCleanup(
            version: 1, householdId: member.householdId, uploadId: staged.input.uploadId,
            path: deleting.path, status: .deleted)
        try await reopened.finishReceiptCleanup(deleted, lease: restored)
        let cleared = try await reopened.readReceiptUpload(lease: restored)
        XCTAssertNil(cleared)
    }
}
