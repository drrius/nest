import Foundation
import XCTest

@testable import Nest

@MainActor
final class MealPreparationModelTests: XCTestCase {
    func testLostCreateReplySurvivesRestoreAndRetriesExactCommand() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadMealPreparationContext(server.target)
        var draft = MealPreparationFormDraft(context.baseline)
        draft.title = "Soak lentils"
        let command = try draft.command(operation: UUID())
        await server.loseNextReply()
        let accepted = await model.saveMealPreparation(command, context: context)
        XCTAssertTrue(accepted)
        XCTAssertEqual(model.mealPreparationRequest?.state, .pending)
        await model.restore()
        await model.restorePreparationRecovery()
        XCTAssertEqual(model.mealPreparationRequest?.command, command)
        let before = await server.attempts
        XCTAssertEqual(before.count, 1)
        await model.retryMealPreparation()
        XCTAssertNil(model.mealPreparationRequest)
        let attempts = await server.attempts
        XCTAssertEqual(attempts, [command, command])
        let fresh = try await model.loadMealPreparationContext(server.target)
        XCTAssertEqual(fresh.baseline.preparation?.title, "Soak lentils")
        XCTAssertEqual(fresh.baseline.revision, "1")
        var edit = MealPreparationFormDraft(fresh.baseline)
        edit.instructions = "Rinse first."
        let edited = await model.saveMealPreparation(try edit.command(operation: UUID()), context: fresh)
        XCTAssertTrue(edited)
        let final = try await model.loadMealPreparationContext(server.target)
        XCTAssertEqual(final.baseline.preparation?.instructions, "Rinse first.")
        XCTAssertEqual(final.baseline.preparation?.occurrenceId, fresh.baseline.preparation?.occurrenceId)
    }

    func testConfirmedWriteReadFailureNeverResendsOnRetry() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadMealPreparationContext(server.target)
        var draft = MealPreparationFormDraft(context.baseline)
        draft.title = "Chop vegetables"
        await server.blockReadsAfterWrite()
        _ = await model.saveMealPreparation(try draft.command(operation: UUID()), context: context)
        XCTAssertEqual(model.mealPreparationRequest?.state, .acknowledged)
        await model.retryMealPreparation()
        let during = await server.attempts
        XCTAssertEqual(during.count, 1)
        await server.allowReads()
        await model.retryMealPreparation()
        XCTAssertNil(model.mealPreparationRequest)
        let after = await server.attempts
        XCTAssertEqual(after.count, 1)
    }

    func testStaleDraftAndOldAccountCannotDispatch() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadMealPreparationContext(server.target)
        var draft = MealPreparationFormDraft(context.baseline)
        draft.title = "Prepare sauce"
        let command = try draft.command(operation: UUID())
        await server.advanceWeek()
        let stale = await model.saveMealPreparation(command, context: context)
        XCTAssertFalse(stale)
        XCTAssertNil(model.mealPreparationRequest)
        await model.signIn(idToken: "B", nonce: "test")
        let foreign = await model.saveMealPreparation(command, context: context)
        XCTAssertFalse(foreign)
        let attempts = await server.attempts
        XCTAssertTrue(attempts.isEmpty)
    }

    func testLateReceiptCannotRepopulateAnotherAccountOrAcknowledgeOldLease() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadMealPreparationContext(server.target)
        var draft = MealPreparationFormDraft(context.baseline)
        draft.title = "Prepare sauce"
        let command = try draft.command(operation: UUID())
        await server.pauseNextWrite()
        let save = Task { await model.saveMealPreparation(command, context: context) }
        await server.waitForWrite()
        await model.signIn(idToken: "B", nonce: "test")
        await server.releaseWrite()
        let accepted = await save.value
        XCTAssertFalse(accepted)
        XCTAssertNil(model.mealPreparationRequest)
        await model.restorePreparationRecovery()
        XCTAssertNil(model.mealPreparationRequest)
        await model.signIn(idToken: "A", nonce: "test")
        await model.restorePreparationRecovery()
        XCTAssertEqual(model.mealPreparationRequest?.state, .pending)
        await model.retryMealPreparation()
        XCTAssertNil(model.mealPreparationRequest)
        let attempts = await server.attempts
        XCTAssertEqual(attempts, [command, command])
    }

    func testTerminalConflictRequiresExplicitDiscard() async throws {
        let (model, server) = try fixture()
        await model.restore()
        let context = try await model.loadMealPreparationContext(server.target)
        var draft = MealPreparationFormDraft(context.baseline)
        draft.title = "Prepare sauce"
        await server.rejectWrite()
        _ = await model.saveMealPreparation(try draft.command(operation: UUID()), context: context)
        XCTAssertEqual(model.mealPreparationRequest?.state, .conflict)
        await model.retryMealPreparation()
        let attempts = await server.attempts
        XCTAssertEqual(attempts.count, 1)
        await model.discardPreparationConflict()
        XCTAssertNil(model.mealPreparationRequest)
    }

    private func fixture() throws -> (SessionModel, MealPreparationTestServer) {
        let actor = UUID()
        let partner = UUID()
        let household = UUID()
        let auth = FakeAuthentication(
            active: AuthenticatedSession(userId: actor, accessToken: "token-A"),
            nextSignIn: AuthenticatedSession(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: actor, actorB: partner, household: household)
        let server = MealPreparationTestServer(actor: actor, partner: partner, household: household)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { try await server.respond($0) }
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example/")!) { request in
            if request.url?.path == "/v1/routines/roster" { return try await server.respond(request) }
            return try await chores.respond(request)
        }
        let url = FileManager.default.temporaryDirectory.appending(path: "prep-model-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return (
            SessionModel(
                auth: auth, chores: ChoreAPI(http: choreHTTP),
                offline: try ChoreOfflineStore(url: url), mealAPI: MealAPI(http: http)), server
        )
    }
}
