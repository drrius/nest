import Foundation
import XCTest

@testable import Nest

@MainActor
final class ChoreReminderModelTests: XCTestCase {
    func testExplicitOptInAndLostReplyRecoverWithoutResending() async throws {
        let fixture = try await fixture()
        let id = await fixture.server.chore.id
        let model = ChoreReminderModel()
        await model.load(id: id, session: fixture.session, member: fixture.member)
        XCTAssertTrue(model.loaded)
        XCTAssertFalse(model.settings.enabled)
        XCTAssertTrue(model.settings.recipientIds.isEmpty)
        let initial = await fixture.server.writes
        XCTAssertEqual(initial, 0)
        model.settings.enabled = true
        XCTAssertFalse(model.canSave, "Enabling without explicit recipients cannot save")
        model.settings.recipientIds = [fixture.member.userId]
        XCTAssertTrue(model.canSave)
        await model.save(session: fixture.session, member: fixture.member)
        let command = try XCTUnwrap(model.saved?.command)
        XCTAssertEqual(model.saved?.result?.status, .unresolved)
        await model.finish(id: id, session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.command, command)
        let reopened = ChoreReminderModel()
        await reopened.load(id: id, session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.command, command)
        await reopened.retry(session: fixture.session, member: fixture.member)
        XCTAssertEqual(reopened.saved?.result?.status, .recorded)
        XCTAssertEqual(reopened.baseline?.reminder?.settings, command.settings)
        let total = await fixture.server.writes
        XCTAssertEqual(total, 1)
        await reopened.finish(id: id, session: fixture.session, member: fixture.member)
        XCTAssertNil(reopened.saved)
        XCTAssertEqual(reopened.settings, command.settings)
    }

    func testPreflightConflictPreservesDraftAndDoesNotStage() async throws {
        for itemChanged in [false, true] {
            let fixture = try await fixture()
            let id = await fixture.server.chore.id
            let model = ChoreReminderModel()
            await model.load(id: id, session: fixture.session, member: fixture.member)
            model.settings.localTime = "09:30"
            if itemChanged { await fixture.server.changeChore() } else { await fixture.server.changeReminder() }
            await model.save(session: fixture.session, member: fixture.member)
            XCTAssertNil(model.saved)
            XCTAssertEqual(model.settings.localTime, "09:30")
            XCTAssertTrue(model.dirty)
            let writes = await fixture.server.writes
            XCTAssertEqual(writes, 0)
        }
    }

    func testUntransmittedRequestCancelsWithoutOptIn() async throws {
        let fixture = try await fixture()
        let id = await fixture.server.chore.id
        await fixture.server.failBeforeTransmission()
        let model = ChoreReminderModel()
        await model.load(id: id, session: fixture.session, member: fixture.member)
        await model.save(session: fixture.session, member: fixture.member)
        XCTAssertNotNil(model.saved)
        await model.cancel(session: fixture.session, member: fixture.member)
        XCTAssertEqual(model.saved?.result?.status, .cancelled)
        let writes = await fixture.server.writes
        XCTAssertEqual(writes, 0)
        await model.finish(id: id, session: fixture.session, member: fixture.member)
        XCTAssertNil(model.saved)
        XCTAssertFalse(model.settings.enabled)
    }

    func testLateReminderReceiptRejectedAfterSignOutAndMemberSwitch() async throws {
        for switchMember in [false, true] { try await checkAccount(switchMember) }
    }

    private func checkAccount(_ switchMember: Bool) async throws {
        let fixture = try await fixture()
        let id = await fixture.server.chore.id
        let model = ChoreReminderModel()
        await model.load(id: id, session: fixture.session, member: fixture.member)
        let context = try fixture.session.renewalContext()
        await fixture.server.pauseNext()
        let request = Task { await model.save(session: fixture.session, member: fixture.member) }
        await fixture.server.waitForWrite()
        await fixture.session.signOut()
        if switchMember { await fixture.session.signIn(idToken: "apple-B", nonce: "nonce-B") }
        await fixture.server.release()
        await request.value
        XCTAssertNil(model.saved)
        XCTAssertNil(model.baseline)
        if switchMember {
            let other = try await fixture.session.savedChoreReminderRequest(fixture.session.renewalContext())
            XCTAssertNil(other)
        }
        let lease = try await fixture.store.activate(fixture.member)
        let retained = try await fixture.store.readChoreReminderRequest(lease: lease)
        XCTAssertEqual(retained?.command.occurrenceId, id)
        XCTAssertEqual(retained?.result?.status, .unresolved)
        XCTAssertNotEqual(context.lease, lease)
    }

    private func fixture() async throws -> (
        session: SessionModel, store: ChoreOfflineStore,
        server: ChoreReminderTestServer, member: VerifiedMember
    ) {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = try ChoreReminderTestServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "reminder-native-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: store,
            notificationAPI: NotificationAPI(http: http))
        await session.restore()
        XCTAssertEqual(session.status, .ready(member))
        return (session, store, server, member)
    }
}
