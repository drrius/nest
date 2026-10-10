import Foundation
import XCTest

@testable import NestCore

final class MoneyReadStoreTests: XCTestCase {
    private let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
    private let partner = UUID()
    private let date = Date(timeIntervalSince1970: 1_790_985_600)

    func testRestartRetainsExactCentimesAndActorHouseholdIsolation() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let ticket = try await store.beginMoneyRead(.balance(member), lease: lease)
        try await store.saveMoneyRead(balance(101), ticket: ticket, savedAt: date)
        let reopened = try ChoreOfflineStore(url: url)
        for other in [
            VerifiedMember(userId: partner, householdId: member.householdId, displayName: "Sam"),
            VerifiedMember(userId: member.userId, householdId: UUID(), displayName: "Alex"),
        ] {
            let foreignLease = try await reopened.activate(other)
            let foreignTicket = try await reopened.beginMoneyRead(.balance(other), lease: foreignLease)
            let foreign = try await reopened.readMoneySnapshot(foreignTicket)
            XCTAssertNil(foreign)
            do {
                _ = try await store.readMoneySnapshot(ticket)
                XCTFail("Read with stale lease")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
            do {
                try await store.saveMoneyRead(balance(202), ticket: ticket, savedAt: date)
                XCTFail("Saved with stale lease")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
            do {
                try await store.forgetMoneyReads(lease: lease)
                XCTFail("Erased with stale lease")
            } catch { XCTAssertEqual(error as? OfflineFailure, .sessionChanged) }
        }
        let restored = try await reopened.activate(member)
        let restoredTicket = try await reopened.beginMoneyRead(.balance(member), lease: restored)
        let saved = try await reopened.readMoneySnapshot(restoredTicket)
        XCTAssertEqual(saved?.value.members.first?.centimes.value, 101)
        XCTAssertEqual(saved?.savedAt, date)
    }

    func testNewestRequestWinsEvenWhenOlderResponseArrivesLast() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let old = try await store.beginMoneyRead(.balance(member), lease: lease)
        let latest = try await store.beginMoneyRead(.balance(member), lease: lease)
        try await store.saveMoneyRead(balance(202), ticket: latest, savedAt: date)
        try await store.saveMoneyRead(balance(101), ticket: old, savedAt: date.addingTimeInterval(10))
        let saved = try await store.readMoneySnapshot(latest)
        XCTAssertEqual(saved?.value.members.first?.centimes.value, 202)
        let failedRefresh = try await store.beginMoneyRead(.balance(member), lease: lease)
        let retained = try await store.readMoneySnapshot(failedRefresh)
        XCTAssertEqual(retained?.value.members.first?.centimes.value, 202)
    }

    func testHistoryCursorAndDetailTargetStaySeparateAcrossRestart() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let cursor = UUID()
        let page = try await store.beginMoneyRead(.history(member, before: cursor), lease: lease)
        try await store.saveMoneyRead(
            MoneyHistory(version: 1, householdId: member.householdId, before: cursor, next: nil, events: []),
            ticket: page, savedAt: date)
        let event = UUID()
        let entry = try await store.beginMoneyRead(.detail(member, eventId: event), lease: lease)
        try await store.saveMoneyRead(detail(event), ticket: entry, savedAt: date)
        let reopened = try ChoreOfflineStore(url: url)
        let active = try await reopened.activate(member)
        let first = try await reopened.beginMoneyRead(.history(member, before: nil), lease: active)
        let missingFirst = try await reopened.readMoneySnapshot(first)
        XCTAssertNil(missingFirst)
        let other = try await reopened.beginMoneyRead(.detail(member, eventId: UUID()), lease: active)
        let missingDetail = try await reopened.readMoneySnapshot(other)
        XCTAssertNil(missingDetail)
        let cachedPage = try await reopened.beginMoneyRead(.history(member, before: cursor), lease: active)
        let cachedEntry = try await reopened.beginMoneyRead(.detail(member, eventId: event), lease: active)
        let savedPage = try await reopened.readMoneySnapshot(cachedPage)
        let savedEntry = try await reopened.readMoneySnapshot(cachedEntry)
        XCTAssertEqual(savedPage?.value.before, cursor)
        XCTAssertEqual(savedEntry?.value.event.id, event)
    }

    func testInvalidStoredBalanceAndWrongDetailAreRejected() async throws {
        let url = database()
        let store = try ChoreOfflineStore(url: url)
        let lease = try await store.activate(member)
        let ticket = try await store.beginMoneyRead(.balance(member), lease: lease)
        let broken = MoneyBalance(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("101")),
                .init(actorId: partner, displayName: "Sam", centimes: try Centimes("0")),
            ])
        let raw = SavedMoneyRead(value: broken, savedAt: date)
        let connection = try SQLiteConnection(url: url)
        try connection.run(
            "UPDATE money_read_snapshots SET body=? WHERE actor=? AND household=? AND target='balance'",
            [String(decoding: try JSONEncoder().encode(raw), as: UTF8.self)] + lease.scope)
        do {
            _ = try await store.readMoneySnapshot(ticket)
            XCTFail("Trusted invalid cached financial data")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
        let entry = try await store.beginMoneyRead(.detail(member, eventId: UUID()), lease: lease)
        do {
            try await store.saveMoneyRead(detail(UUID()), ticket: entry, savedAt: date)
            XCTFail("Saved unrelated entry")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
    }

    func testCacheRevocationPreservesUncertainExpenseAndCannotBeRepopulatedByOldRead() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        let ticket = try await store.beginMoneyRead(.balance(member), lease: lease)
        try await store.saveMoneyRead(balance(101), ticket: ticket, savedAt: date)
        let expense = ExpenseInput(
            description: "Fixture", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let command = SaveExpense(operationId: UUID(), expense: expense)
        try await store.enqueueExpense(command, lease: lease)
        try await store.forgetMoneyReads(lease: lease)
        try await store.saveMoneyRead(balance(202), ticket: ticket, savedAt: date)
        let cleared = try await store.readMoneySnapshot(ticket)
        let pending = try await store.readExpense(lease: lease)
        XCTAssertNil(cleared)
        XCTAssertEqual(pending?.command, command)
    }

    func testGeneratedCentimeSnapshotsPreserveZeroSumAndExactWireRange() async throws {
        let store = try ChoreOfflineStore(url: database())
        let lease = try await store.activate(member)
        for amount in [-9_007_199_254_740_991, -101, -1, 0, 1, 101, 9_007_199_254_740_991] as [Int64] {
            let ticket = try await store.beginMoneyRead(.balance(member), lease: lease)
            try await store.saveMoneyRead(balance(amount), ticket: ticket, savedAt: date)
            let saved = try await store.readMoneySnapshot(ticket)
            XCTAssertEqual(saved?.value.members.first?.centimes.value, amount)
            XCTAssertEqual(saved?.value.members.reduce(0, { $0 + $1.centimes.value }), 0)
        }
    }

    private func database() -> URL {
        let url = FileManager.default.temporaryDirectory.appending(path: "money-read-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func balance(_ amount: Int64) throws -> MoneyBalance {
        MoneyBalance(
            version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: false,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes(String(amount))),
                .init(actorId: partner, displayName: "Sam", centimes: try Centimes(String(-amount))),
            ])
    }

    private func detail(_ event: UUID) throws -> MoneyDetail {
        MoneyDetail(
            version: 1, householdId: member.householdId,
            event: MoneyEventSummary(
                eventId: event, kind: .settlement, occurredOn: "2026-09-28", createdAt: "2026-09-28T00:00:00.000000Z",
                occurredOrder: "1", createdOrder: "1", description: "Fixture", amountCentimes: try Centimes("101"),
                createdBy: member.userId, payerId: member.userId, relatedEventId: nil, hasReceipt: false),
            receiptTotalCentimes: nil, note: nil, category: nil, reversedById: nil,
            shares: [
                .init(memberId: member.userId, allocatedCentimes: nil, deltaCentimes: try Centimes("101")),
                .init(memberId: partner, allocatedCentimes: nil, deltaCentimes: try Centimes("-101")),
            ])
    }
}
