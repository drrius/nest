import Foundation
import XCTest

@testable import Nest

@MainActor
final class RenewalsModelTests: XCTestCase {
    func testLostSaveAndRemovalRecoverBeforeResendAndRefreshBeforeDone() async throws {
        let fixture = try await fixture()
        let model = RenewalsModel()
        await model.load(session: fixture.session, member: fixture.member)
        XCTAssertTrue(model.loaded)
        try await model.save(fields: fields(), baseline: nil, session: fixture.session, member: fixture.member)
        let command = try XCTUnwrap(model.saved?.command)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await model.finish(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.command, command, "Uncertain requests cannot be cleared")
        let reopened = RenewalsModel()
        await reopened.load(session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.command, command)
        await reopened.retry(session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        XCTAssertEqual(reopened.rows.first?.fields, try fields(), "Refresh immediately before Done")
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 1, "Recover recorded receipt instead of resending")
        await reopened.cancel(session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded, "Cancellation cannot undo a confirmed save")
        await reopened.finish(session: fixture.session, member: fixture.member)
        XCTAssertNil(reopened.saved)
        let row = try XCTUnwrap(reopened.rows.first)
        await fixture.server.loseNext()
        await reopened.remove(row, session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.result?.status, .unresolved)
        await reopened.cancel(session: fixture.session, member: fixture.member)
        XCTAssertTrue(reopened.saved?.cancellationRequested == true)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded, "A lost removal receipt is already recorded")
        XCTAssertTrue(reopened.rows.isEmpty)
        let total = await fixture.server.writes
        XCTAssertEqual(total, 2)
    }

    func testCancellationBeforeTransmissionDoesNotCreateRenewal() async throws {
        let fixture = try await fixture()
        await fixture.server.failBeforeTransmission()
        let model = RenewalsModel()
        try await model.save(fields: fields(), baseline: nil, session: fixture.session, member: fixture.member)
        XCTAssertNotNil(model.saved)
        await model.cancel(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.result?.status, .cancelled)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
        await model.finish(session: fixture.session, member: fixture.member)
        XCTAssertNil(model.saved)
        XCTAssertTrue(model.rows.isEmpty)
    }

    func testLateReceiptCannotAcknowledgeAfterSignOutOrMemberSwitch() async throws {
        for switchMember in [false, true] { try await checkAccountChange(switchMember) }
    }

    private func checkAccountChange(_ switchMember: Bool) async throws {
        let fixture = try await fixture()
        await fixture.server.pauseNext()
        let context = try fixture.session.renewalContext()
        let command = RenewalCommand(
            operationId: UUID(), renewalId: UUID(), expectedRevision: nil,
            fields: try fields())
        try await fixture.session.stageRenewalChange(command, baseline: nil, context: context)
        let request = Task { try await fixture.session.retryRenewalChange(context) }
        await fixture.server.waitForWrite()
        await fixture.session.signOut()
        if switchMember { await fixture.session.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await fixture.server.release()
        do {
            try await request.value
            XCTFail("Accepted late receipt")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        if switchMember {
            let partnerContext = try fixture.session.renewalContext()
            let foreign = try await fixture.session.savedRenewalRequest(partnerContext)
            XCTAssertNil(foreign)
        }
        let lease = try await fixture.store.activate(fixture.member)
        let retained = try await fixture.store.readRenewalRequest(lease: lease)
        XCTAssertEqual(retained?.command, command)
        XCTAssertEqual(retained?.result?.status, .unresolved)
    }

    func testPreviouslyLoadedRenewalsRemainReadableAfterOfflineRestart() async throws {
        let fixture = try await fixture()
        let row = try seededRenewal()
        await fixture.server.seedRead(row)
        let first = RenewalsModel()
        await first.load(session: fixture.session, member: fixture.member)
        XCTAssertEqual(first.rows, [row])
        await fixture.readGate.set(.offline)
        await fixture.chores.makeUnavailable()
        let reopenedStore = try ChoreOfflineStore(url: fixture.url)
        let reopenedSession = SessionModel(
            auth: fixture.auth, chores: try XCTUnwrap(fixture.session.chores), offline: reopenedStore,
            renewalAPI: fixture.session.renewalAPI)
        await reopenedSession.restore()
        XCTAssertEqual(reopenedSession.status, .ready(fixture.member))
        let reopened = RenewalsModel()
        await reopened.load(session: reopenedSession, member: fixture.member)
        XCTAssertEqual(reopened.rows, [row])
        XCTAssertTrue(reopened.loaded)
        XCTAssertTrue(reopened.notice?.contains("Saved information from") == true)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testUnavailableRefreshRetainsPreviouslyLoadedRows() async throws {
        let fixture = try await fixture()
        let row = try seededRenewal()
        await fixture.server.seedRead(row)
        let model = RenewalsModel()
        await model.load(session: fixture.session, member: fixture.member)
        await fixture.readGate.set(.offline)
        await model.load(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.rows, [row])
        XCTAssertTrue(model.loaded)
        XCTAssertTrue(model.notice?.contains("Refresh when online") == true)
    }

    func testFreshReadReplacesStaleRowsAndClearsSavedGuidance() async throws {
        let fixture = try await fixture()
        let original = try seededRenewal()
        await fixture.server.seedRead(original)
        let model = RenewalsModel()
        await model.load(session: fixture.session, member: fixture.member)
        await fixture.readGate.set(.offline)
        await model.load(session: fixture.session, member: fixture.member)
        XCTAssertNotNil(model.notice)
        let changed = CalendarRenewal(
            renewalId: original.id, revision: UUID(), fields: original.fields,
            cancellationOn: original.cancellationOn, removed: false)
        await fixture.server.seedRead(changed)
        await fixture.readGate.set(.online)
        await model.load(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.rows, [changed])
        XCTAssertNil(model.notice)
    }

    func testAuthorizationAndMalformedResponsesNeverFallBackToSavedRows() async throws {
        for mode in [
            RenewalReadFailureGate.Mode.status(401), .status(403), .status(403, code: "forbidden"), .malformed,
        ] {
            let fixture = try await fixture()
            await fixture.server.seedRead(try seededRenewal())
            let model = RenewalsModel()
            await model.load(session: fixture.session, member: fixture.member)
            XCTAssertEqual(model.rows.count, 1)
            await fixture.readGate.set(mode)
            await model.load(session: fixture.session, member: fixture.member)
            XCTAssertTrue(model.rows.isEmpty)
            XCTAssertFalse(model.loaded, "Denied or malformed reads must not pretend the list is empty")
            if case .status = mode {
                let lease = try await fixture.store.activate(fixture.member)
                let ticket = try await fixture.store.beginRenewalRead(.list(fixture.member, after: nil), lease: lease)
                let cached = try await fixture.store.readRenewalSnapshot(ticket)
                XCTAssertNil(cached, "Authorization denial purges that account's renewal cache")
            }
        }
    }

    func testLateReadCannotPopulateAnotherAccountAfterMemberSwitch() async throws {
        let fixture = try await fixture()
        await fixture.server.seedRead(try seededRenewal())
        await fixture.readGate.pauseNextRead()
        let model = RenewalsModel()
        let pending = Task { await model.load(session: fixture.session, member: fixture.member) }
        await fixture.readGate.waitForRead()
        await fixture.session.signOut()
        await fixture.session.signIn(idToken: "apple-B", nonce: "nonce-B")
        await fixture.readGate.release()
        await pending.value
        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertFalse(model.loaded)
        let other = try fixture.session.renewalContext()
        let ticket = try await fixture.store.beginRenewalRead(.list(other.member, after: nil), lease: other.lease)
        let cached = try await fixture.store.readRenewalSnapshot(ticket)
        XCTAssertNil(cached)
    }

    func testCachedDetailNeverSuppliesMutationPreflightWhileOffline() async throws {
        let fixture = try await fixture()
        let row = try seededRenewal()
        await fixture.server.seedRead(row)
        let context = try fixture.session.renewalContext()
        _ = try await fixture.session.loadRenewal(context, id: row.id)
        await fixture.readGate.set(.offline)
        let savedView = try await fixture.session.loadRenewal(context, id: row.id)
        XCTAssertEqual(savedView.value, row)
        XCTAssertFalse(savedView.fresh)
        let command = RenewalCommand(
            operationId: UUID(), renewalId: row.id, expectedRevision: row.revision, fields: row.fields)
        do {
            try await fixture.session.stageRenewalChange(command, baseline: row, context: context)
            XCTFail("Cached detail authorized an online mutation")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await fixture.session.savedRenewalRequest(context)
        XCTAssertNil(pending)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
    }

    func testConfirmedRemovalCannotReappearAfterUnavailableReadAndDone() async throws {
        let fixture = try await fixture()
        let row = try seededRenewal()
        await fixture.server.seedRead(row)
        let model = RenewalsModel()
        await model.load(session: fixture.session, member: fixture.member)
        let context = try fixture.session.renewalContext()
        _ = try await fixture.session.loadRenewal(context, id: row.id)
        await model.remove(row, session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await fixture.readGate.set(.listOffline)
        await model.retry(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.result?.status, .recorded)
        XCTAssertFalse(model.loaded, "Invalidating old pages does not prove a known empty list")
        await fixture.readGate.set(.offline)
        await model.finish(session: fixture.session, member: fixture.member)
        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertFalse(model.loaded, "The confirmed removed row cannot return as an active offline snapshot")
        let detail = try await fixture.session.loadRenewal(context, id: row.id)
        XCTAssertTrue(detail.value.removed)
        XCTAssertFalse(detail.fresh)
    }

    func testLateDetailResponseCannotReviveAConfirmedRemoval() async throws {
        let fixture = try await fixture()
        let row = try seededRenewal()
        await fixture.server.seedRead(row)
        let context = try fixture.session.renewalContext()
        await fixture.readGate.pauseNextRead()
        let delayed = Task { try await fixture.session.loadRenewal(context, id: row.id) }
        await fixture.readGate.waitForRead()
        let model = RenewalsModel()
        await model.remove(row, session: fixture.session, member: fixture.member)
        await model.retry(session: fixture.session, member: fixture.member)
        let removed = try XCTUnwrap(model.saved?.result?.receipt?.renewal)
        XCTAssertTrue(removed.removed)
        await fixture.readGate.release()
        let observed = try await delayed.value
        XCTAssertEqual(observed.value, removed)
        XCTAssertFalse(observed.fresh)
        XCTAssertTrue(observed.notice?.contains("Saved information from") == true)
    }

    func testLateFirstPageResponseUsesNewerValidatedSnapshot() async throws {
        let fixture = try await fixture()
        let original = try seededRenewal()
        await fixture.server.seedRead(original)
        let context = try fixture.session.renewalContext()
        await fixture.readGate.pauseNextRead()
        let delayed = Task { try await fixture.session.loadRenewals(context, after: nil) }
        await fixture.readGate.waitForRead()
        let changed = CalendarRenewal(
            renewalId: original.id, revision: UUID(), fields: original.fields,
            cancellationOn: original.cancellationOn, removed: false)
        await fixture.server.seedRead(changed)
        let newer = try await fixture.session.loadRenewals(context, after: nil)
        XCTAssertTrue(newer.fresh)
        await fixture.readGate.release()
        let observed = try await delayed.value
        XCTAssertEqual(observed.value.renewals, [changed])
        XCTAssertEqual(observed.collectionId, newer.collectionId)
        XCTAssertFalse(observed.fresh)
    }

    private func seededRenewal() throws -> CalendarRenewal {
        let values = try fields()
        return CalendarRenewal(
            renewalId: UUID(), revision: UUID(), fields: values,
            cancellationOn: try XCTUnwrap(values.cancellationDeadline), removed: false)
    }

    private func fields() throws -> CalendarRenewal.Fields {
        .init(
            title: "Fictional renewal", renewalOn: try CivilDate("2028-03-01"), noticeDays: 1,
            responsibleId: nil, recurringRuleId: nil)
    }

    private func fixture() async throws -> (
        session: SessionModel, store: ChoreOfflineStore,
        server: RenewalTestServer, member: VerifiedMember, readGate: RenewalReadFailureGate,
        auth: FakeAuthentication, chores: FakeChoreServer, url: URL
    ) {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = RenewalTestServer(member: member)
        let readGate = RenewalReadFailureGate()
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            try await readGate.respond(request) { try await server.respond(request) }
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "renewal-native-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            renewalAPI: RenewalAPI(http: http))
        await session.restore()
        XCTAssertEqual(session.status, .ready(member))
        return (session, store, server, member, readGate, auth, chores, url)
    }
}
