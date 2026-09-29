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

    private func fields() throws -> CalendarRenewal.Fields {
        .init(
            title: "Fictional renewal", renewalOn: try CivilDate("2028-03-01"), noticeDays: 1,
            responsibleId: nil, recurringRuleId: nil)
    }

    private func fixture() async throws -> (
        session: SessionModel, store: ChoreOfflineStore,
        server: RenewalTestServer, member: VerifiedMember
    ) {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = RenewalTestServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "renewal-native-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            renewalAPI: RenewalAPI(http: http))
        await session.restore()
        XCTAssertEqual(session.status, .ready(member))
        return (session, store, server, member)
    }
}
