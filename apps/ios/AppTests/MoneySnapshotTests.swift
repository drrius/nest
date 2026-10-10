import Foundation
import XCTest

@testable import Nest

@MainActor
final class MoneySnapshotTests: XCTestCase {
    func testPreviouslyLoadedFinancialReadsSurviveOfflineProcessRestart() async throws {
        let fixture = try fixture()
        let first = try fixture.model()
        await first.restore()
        try await fixture.seed(first)
        await fixture.server.failOffline()
        await fixture.chores.makeUnavailable()
        let restarted = try fixture.model()
        await restarted.restore()
        XCTAssertEqual(restarted.status, .ready(fixture.member))
        let immediate = try await restarted.cachedMoneyRead(.balance(fixture.member), generation: restarted.generation)
        XCTAssertEqual(immediate?.value.members.first?.centimes.value, 101)
        let balance = try await restarted.loadMoneyBalance(member: fixture.member, generation: restarted.generation)
        let history = try await restarted.loadMoneyHistory(
            member: fixture.member, generation: restarted.generation, before: nil)
        let detail = try await restarted.loadMoneyDetail(
            member: fixture.member, generation: restarted.generation, eventId: fixture.eventId)
        XCTAssertEqual(balance.value.members.first?.centimes.value, 101)
        XCTAssertEqual(history.value.events.map(\.id), [fixture.eventId])
        XCTAssertEqual(detail.value.shares.first?.deltaCentimes.value, 101)
        for notice in [balance.notice, history.notice, detail.notice] {
            XCTAssertTrue(notice?.contains("Showing saved information") == true)
        }
        for route in 0..<3 {
            do {
                try await onlineRead(restarted, fixture: fixture, route: route)
                XCTFail("Online financial preflight used stale information")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        }
        let expense = ExpenseInput(
            description: "Fixture", amountCentimes: try Centimes("101"), receiptPath: nil,
            receiptTotalCentimes: nil, payerId: fixture.member.userId,
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: fixture.member.userId, other: fixture.partner),
            date: try CivilDate("2026-09-28"), note: nil, categoryId: nil)
        let context = try restarted.expenseContext()
        do {
            try await restarted.stageExpense(expense, context: context)
            XCTFail("Cached balance enabled a new offline financial command")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await restarted.savedExpense(context)
        XCTAssertNil(pending)
    }

    func testAuthoritativeMoneyDenialNeverFallsBackAndRevokesSavedReads() async throws {
        for (status, code) in [(401, "not_a_member"), (403, "not_a_member"), (403, "forbidden")] {
            let fixture = try fixture()
            let model = try fixture.model()
            await model.restore()
            try await fixture.seed(model)
            await fixture.server.reject(status, code: code)
            do {
                _ = try await model.loadMoneyBalance(member: fixture.member, generation: model.generation)
                XCTFail("Authorization denial fell back to cached money")
            } catch {
                XCTAssertEqual(
                    error as? NestAPIFailure, status == 401 ? .signedOut : code == "forbidden" ? .forbidden : .notMember
                )
            }
            XCTAssertEqual(model.status, status == 401 ? .signedOut : .notMember)
            let store = try ChoreOfflineStore(url: fixture.url)
            let lease = try await store.activate(fixture.member)
            let ticket = try await store.beginMoneyRead(.balance(fixture.member), lease: lease)
            let saved = try await store.readMoneySnapshot(ticket)
            XCTAssertNil(saved)
        }
    }

    func testFreshProcessMembershipDenialCannotReviveCacheOnLaterOfflineBoot() async throws {
        let fixture = try fixture()
        let initial = try fixture.model()
        await initial.restore()
        try await fixture.seed(initial)
        await fixture.server.rejectMembership(403)
        let denied = try fixture.model()
        await denied.restore()
        XCTAssertEqual(denied.status, .notMember)
        await fixture.chores.makeUnavailable()
        await fixture.server.rejectMembership(503)
        let offline = try fixture.model()
        await offline.restore()
        XCTAssertNotEqual(offline.status, .ready(fixture.member))
        let store = try ChoreOfflineStore(url: fixture.url)
        let lease = try await store.activate(fixture.member)
        let ticket = try await store.beginMoneyRead(.balance(fixture.member), lease: lease)
        let saved = try await store.readMoneySnapshot(ticket)
        XCTAssertNil(saved)
    }

    func testLateSuccessAndDenialCannotAffectTheNewAccount() async throws {
        for status in [200, 403] {
            let fixture = try fixture()
            let model = try fixture.model()
            await model.restore()
            try await fixture.seed(model)
            await fixture.server.reject(status)
            await fixture.server.pauseNext()
            let generation = model.generation
            let delayed = Task { try await model.loadMoneyBalance(member: fixture.member, generation: generation) }
            await fixture.server.waitForRequest()
            await model.signOut()
            await model.signIn(idToken: "apple-B", nonce: "nonce-B")
            await fixture.server.release()
            do {
                _ = try await delayed.value
                XCTFail("Old account read escaped generation fencing")
            } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
            XCTAssertEqual(
                model.status,
                .ready(
                    VerifiedMember(
                        userId: fixture.partner,
                        householdId: fixture.member.householdId, displayName: "Sam")))
        }
    }

    func testConflictAndInvalidResponsesNeverUseSavedMoney() async throws {
        for status in [400, 409, 410] {
            let fixture = try fixture()
            let model = try fixture.model()
            await model.restore()
            try await fixture.seed(model)
            await fixture.server.reject(status)
            do {
                _ = try await model.loadMoneyBalance(member: fixture.member, generation: model.generation)
                XCTFail("Non-network failure fell back to cache")
            } catch {
                XCTAssertEqual(error as? NestAPIFailure, [400: .invalid, 409: .conflict, 410: .removed][status])
            }
        }
    }

    func testMalformedLiveResponseCannotMasqueradeAsSuccessfulSavedRead() async throws {
        let fixture = try fixture()
        let model = try fixture.model()
        await model.restore()
        try await fixture.seed(model)
        await fixture.server.makeMalformed()
        do {
            _ = try await model.loadMoneyBalance(member: fixture.member, generation: model.generation)
            XCTFail("Malformed response fell back to saved data")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .contract) }
    }

    func testCachedIdentityChangeCannotExposePreviousAccountBeforePresentationCatchesUp() async throws {
        let fixture = try fixture()
        let model = try fixture.model()
        await model.restore()
        try await fixture.seed(model)
        await fixture.auth.queueSessions([.init(userId: fixture.partner, accessToken: "token-B")])
        _ = try await fixture.auth.session()
        XCTAssertEqual(model.status, .ready(fixture.member))
        do {
            _ = try await model.cachedMoneyRead(.balance(fixture.member), generation: model.generation)
            XCTFail("Cached SDK identity changed but old-account data was exposed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }

    private func fixture() throws -> MoneySnapshotFixture {
        let fixture = try MoneySnapshotFixture()
        addTeardownBlock { try? FileManager.default.removeItem(at: fixture.url) }
        return fixture
    }

    private func onlineRead(_ model: SessionModel, fixture: MoneySnapshotFixture, route: Int) async throws {
        if route == 0 {
            _ = try await model.readMoneyBalance(member: fixture.member, generation: model.generation)
        } else if route == 1 {
            _ = try await model.readMoneyHistory(member: fixture.member, generation: model.generation, before: nil)
        } else {
            _ = try await model.readMoneyDetail(
                member: fixture.member, generation: model.generation, eventId: fixture.eventId)
        }
    }
}
