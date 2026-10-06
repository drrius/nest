import Foundation
import XCTest

@testable import NestCore

final class RenewalReadStoreTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let captured = Date(timeIntervalSince1970: 1_791_235_200)

    func testRestartRetainsValidatedPagesAndRemovedDetailWithinOriginalScope() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let first = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        let root = try page(1...50, next: id(50))
        _ = try await store.saveRenewalRead(root, ticket: first, savedAt: captured)
        let next = try await store.beginRenewalRead(.list(member, after: id(50)), lease: lease)
        _ = try await store.saveRenewalRead(try page(51...52, after: id(50)), ticket: next, savedAt: captured)
        let removed = try renewal(51, removed: true)
        let detail = try await store.beginRenewalRead(.detail(member, id: removed.id), lease: lease)
        _ = try await store.saveRenewalRead(removed, ticket: detail, savedAt: captured)
        let reopened = try ChoreOfflineStore(url: url)
        let renewed = try await reopened.activate(member)
        let firstRead = try await reopened.beginRenewalRead(.list(member, after: nil), lease: renewed)
        let saved = try await reopened.readRenewalSnapshot(firstRead)
        XCTAssertEqual(saved?.value.renewals, root.renewals)
        XCTAssertEqual(saved?.savedAt, captured)
        let nextRead = try await reopened.beginRenewalRead(
            .list(member, after: id(50)), lease: renewed, collection: saved?.collectionId)
        let tail = try await reopened.readRenewalSnapshot(nextRead)
        XCTAssertEqual(tail?.value.renewals.map(\.id), [id(51), id(52)])
        let detailRead = try await reopened.beginRenewalRead(.detail(member, id: removed.id), lease: renewed)
        let savedDetail = try await reopened.readRenewalSnapshot(detailRead)
        XCTAssertEqual(savedDetail?.value, removed)
    }

    func testForeignActorHouseholdAndObsoleteLeasesCannotAccessOrWriteSnapshots() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let first = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...1), ticket: first, savedAt: captured)
        for foreign in [
            VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Sam"),
            VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Alex"),
        ] {
            let current = try await store.activate(foreign)
            let ticket = try await store.beginRenewalRead(.list(foreign, after: nil), lease: current)
            let saved = try await store.readRenewalSnapshot(ticket)
            XCTAssertNil(saved)
            do {
                _ = try await store.readRenewalSnapshot(first)
                XCTFail("Old lease read cached household data")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
            do {
                _ = try await store.saveRenewalRead(try page(1...1), ticket: first, savedAt: captured)
                XCTFail("Old lease wrote a cache")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        }
    }

    func testFreshFirstPageInvalidatesOlderPagesAndLatePageCannotRepopulateThem() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let first = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...50, next: id(50)), ticket: first, savedAt: captured)
        let oldPage = try await store.beginRenewalRead(.list(member, after: id(50)), lease: lease)
        _ = try await store.saveRenewalRead(try page(51...51, after: id(50)), ticket: oldPage, savedAt: captured)
        let late = try await store.beginRenewalRead(.list(member, after: id(50)), lease: lease)
        let fresh = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...1), ticket: fresh, savedAt: captured.addingTimeInterval(30))
        let stored = try await store.saveRenewalRead(try page(51...51, after: id(50)), ticket: late, savedAt: captured)
        XCTAssertFalse(stored)
        let cursor = try await store.beginRenewalRead(.list(member, after: id(50)), lease: lease)
        let missing = try await store.readRenewalSnapshot(cursor)
        XCTAssertNil(missing)
        do {
            _ = try await store.beginRenewalRead(
                .list(member, after: id(50)), lease: lease, collection: first.collectionId)
            XCTFail("Appended pages from another first-page capture")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .conflict) }
        let saved = try await store.readRenewalSnapshot(fresh)
        XCTAssertEqual(saved?.value.renewals.map(\.id), [id(1)])
    }

    func testLatestRequestWinsAndMalformedSnapshotCannotEnterOrMasqueradeAsCache() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let old = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        let latest = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(2...2), ticket: latest, savedAt: captured)
        let obsolete = try await store.saveRenewalRead(try page(1...1), ticket: old, savedAt: captured)
        XCTAssertFalse(obsolete)
        let saved = try await store.readRenewalSnapshot(latest)
        XCTAssertEqual(saved?.value.renewals.map(\.id), [id(2)])
        let invalid = RenewalList(version: 1, householdId: UUID(), after: nil, next: nil, renewals: [])
        do {
            _ = try await store.saveRenewalRead(invalid, ticket: latest, savedAt: captured)
            XCTFail("Foreign household response entered cache")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        let connection = try SQLiteConnection(url: url)
        let rows = try connection.rows(
            "SELECT body FROM renewal_read_snapshots WHERE actor=? AND household=?", lease.scope)
        var body = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(rows[0][0].utf8)) as? [String: Any])
        body["actorId"] = UUID().uuidString
        let foreign = String(decoding: try JSONSerialization.data(withJSONObject: body), as: UTF8.self)
        try connection.run(
            "UPDATE renewal_read_snapshots SET body=? WHERE actor=? AND household=?", [foreign] + lease.scope)
        do {
            _ = try await store.readRenewalSnapshot(latest)
            XCTFail("Copied foreign identity was displayed")
        } catch { XCTAssertEqual(error as? OfflineFailure, .storage) }
    }

    func testMembershipRevocationPurgesRenewalReadsBeforeOfflineReactivation() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let ticket = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...1), ticket: ticket, savedAt: captured)
        try await store.revokeMoneyMembership(lease: lease)
        let restored = try await store.activate(member)
        let read = try await store.beginRenewalRead(.list(member, after: nil), lease: restored)
        let saved = try await store.readRenewalSnapshot(read)
        XCTAssertNil(saved)
    }

    func testIdenticalRecordedReceiptDoesNotInvalidateNewerReadOrOtherDetail() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let row = try renewal(1)
        let other = try renewal(2)
        let untouched = try await store.beginRenewalRead(.detail(member, id: other.id), lease: lease)
        _ = try await store.saveRenewalRead(other, ticket: untouched, savedAt: captured)
        let list = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...2), ticket: list, savedAt: captured)
        let command = RenewalCommand(operationId: UUID(), renewalId: row.id, expectedRevision: nil, fields: row.fields)
        try await store.stageRenewalRequest(.init(baseline: nil, command: command, result: nil), lease: lease)
        let receipt = RenewalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, action: .saved, renewal: row)
        let recovery = RenewalRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, status: .recorded, receipt: receipt)
        try await store.recordRenewalRecovery(recovery, lease: lease)
        let invalidated = try await store.readRenewalSnapshot(list)
        XCTAssertNil(invalidated)
        let newer = CalendarRenewal(
            renewalId: row.id, revision: UUID(), fields: row.fields,
            cancellationOn: row.cancellationOn, removed: false)
        let detail = try await store.beginRenewalRead(.detail(member, id: row.id), lease: lease)
        _ = try await store.saveRenewalRead(newer, ticket: detail, savedAt: captured.addingTimeInterval(60))
        let refreshedList = try await store.beginRenewalRead(.list(member, after: nil), lease: lease)
        _ = try await store.saveRenewalRead(try page(1...2), ticket: refreshedList, savedAt: captured)
        try await store.recordRenewalRecovery(recovery, lease: lease)
        let preserved = try await store.readRenewalSnapshot(detail)
        XCTAssertEqual(preserved?.value, newer)
        let preservedList = try await store.readRenewalSnapshot(refreshedList)
        XCTAssertNotNil(preservedList)
        let unrelated = try await store.readRenewalSnapshot(untouched)
        XCTAssertEqual(unrelated?.value, other)
    }

    private func database() -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "renewal-read-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func id(_ n: Int) -> UUID {
        UUID(uuidString: "00000000-0000-4000-8000-\(String(format: "%012d", n))")!
    }

    private func renewal(_ n: Int, removed: Bool = false) throws -> CalendarRenewal {
        let fields = CalendarRenewal.Fields(
            title: "Fictional renewal \(n)", renewalOn: try CivilDate("2028-03-01"), noticeDays: 1,
            responsibleId: nil, recurringRuleId: nil)
        return CalendarRenewal(
            renewalId: id(n), revision: UUID(), fields: fields,
            cancellationOn: try XCTUnwrap(fields.cancellationDeadline), removed: removed)
    }

    private func page(_ values: ClosedRange<Int>, after: UUID? = nil, next: UUID? = nil) throws -> RenewalList {
        RenewalList(
            version: 1, householdId: member.householdId, after: after, next: next,
            renewals: try values.map { try renewal($0) })
    }
}
