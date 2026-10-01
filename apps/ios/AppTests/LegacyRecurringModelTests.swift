import Foundation
import XCTest

@testable import Nest

@MainActor
final class LegacyRecurringModelTests: XCTestCase {
    func testInventoryAndDraftsReadAllPagesWithoutPostingOrSubstitutingRuleTerms() async throws {
        let fixture = try await LegacyRecurringTestFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.base.url) }
        let inventory = LegacyRecurringModel(session: fixture.session, member: fixture.base.member)
        let drafts = LegacyDraftModel(
            session: fixture.session, member: fixture.base.member, ruleId: await fixture.server.ruleId)
        await inventory.load()
        await drafts.load()
        XCTAssertEqual(inventory.rules.count, 20)
        XCTAssertEqual(drafts.drafts.count, 20)
        XCTAssertNotNil(inventory.next)
        XCTAssertNotNil(drafts.next)
        await inventory.load(more: true)
        await drafts.load(more: true)
        XCTAssertEqual(inventory.rules.count, 21)
        XCTAssertEqual(drafts.drafts.count, 21)
        XCTAssertNil(inventory.next)
        XCTAssertNil(drafts.next)
        XCTAssertEqual(inventory.rules.first?.amountCentimes.value, 999)
        XCTAssertEqual(drafts.drafts.first?.amountCentimes?.value, 9_007_199_254_740_991)
        XCTAssertEqual(drafts.drafts.first?.updatedAt.value, "2026-01-01T10:00:00.123456Z")
        await inventory.load()
        await drafts.load()
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testPartnerReadsSameRetainedHouseholdWithTheirOwnVerifiedSession() async throws {
        let fixture = try await LegacyRecurringTestFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.base.url) }
        await fixture.session.signIn(idToken: "B", nonce: "test")
        XCTAssertEqual(fixture.session.status, .ready(fixture.base.partner))
        let inventory = LegacyRecurringModel(session: fixture.session, member: fixture.base.partner)
        let drafts = LegacyDraftModel(
            session: fixture.session, member: fixture.base.partner, ruleId: await fixture.server.ruleId)
        await inventory.load()
        await drafts.load()
        XCTAssertEqual(inventory.rules.count, 20)
        XCTAssertEqual(drafts.drafts.count, 20)
        XCTAssertEqual(drafts.drafts.first?.payerId, fixture.base.member.userId)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testOfflineAndMalformedPagesClearOldRowsWithoutInventingEmptySuccess() async throws {
        let fixture = try await LegacyRecurringTestFixture.make()
        defer { try? FileManager.default.removeItem(at: fixture.base.url) }
        let inventory = LegacyRecurringModel(session: fixture.session, member: fixture.base.member)
        let drafts = LegacyDraftModel(
            session: fixture.session, member: fixture.base.member, ruleId: await fixture.server.ruleId)
        for fault in ["offline", "scope", "cursor", "order"] {
            await fixture.server.setFault("none")
            await inventory.load()
            await drafts.load()
            XCTAssertTrue(inventory.loaded)
            XCTAssertTrue(drafts.loaded)
            await fixture.server.setFault(fault)
            await inventory.load(more: true)
            await drafts.load(more: true)
            XCTAssertTrue(inventory.rules.isEmpty)
            XCTAssertTrue(drafts.drafts.isEmpty)
            XCTAssertFalse(inventory.loaded)
            XCTAssertFalse(drafts.loaded)
            XCTAssertNil(inventory.next)
            XCTAssertNil(drafts.next)
            XCTAssertNotNil(inventory.notice)
            XCTAssertNotNil(drafts.notice)
        }
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testDelayedInventoryAndDraftReadsCannotSurviveSignOutOrAccountReplacement() async throws {
        for switchAccount in [false, true] {
            for isDraft in [false, true] {
                let fixture = try await LegacyRecurringTestFixture.make()
                defer { try? FileManager.default.removeItem(at: fixture.base.url) }
                let inventory = LegacyRecurringModel(session: fixture.session, member: fixture.base.member)
                let drafts = LegacyDraftModel(
                    session: fixture.session, member: fixture.base.member, ruleId: await fixture.server.ruleId)
                await fixture.server.pauseNextRead()
                let load = Task {
                    if isDraft { await drafts.load() } else { await inventory.load() }
                }
                await fixture.server.waitForRead()
                if switchAccount {
                    await fixture.session.signIn(idToken: "B", nonce: "test")
                } else {
                    await fixture.session.signOut()
                }
                await fixture.server.releaseRead()
                await load.value
                XCTAssertTrue(inventory.rules.isEmpty)
                XCTAssertTrue(drafts.drafts.isEmpty)
                XCTAssertNil(inventory.notice)
                XCTAssertNil(drafts.notice)
                XCTAssertFalse(inventory.loaded)
                XCTAssertFalse(drafts.loaded)
                let writes = await fixture.server.writes
                XCTAssertEqual(writes, 0)
            }
        }
    }
}
