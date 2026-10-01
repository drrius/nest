import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringResumeRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyEntry(fault: nil)
    }

    func testFreshPreflightRefusesOfflineOrChangedRuleBeforeJournaling() async throws {
        for fault in ["offline", "household", "revision", "state", "day", "covered"] { try await verifyEntry(fault: fault) }
    }

    private func verifyEntry(fault: String?) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostRecurringResumeReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "change-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let input = RecurringResumeInput(
            ruleId: UUID(), expectedRevision: UUID(), expectedStatus: "paused",
            action: "resume", resumeFrom: try CivilDate("2026-09-28"), firstDueOn: try CivilDate("2026-09-28"))
        await server.prepare(.init(
            member: member, partner: partner, ruleId: input.ruleId, revision: input.expectedRevision,
            configuration: try RecurringEntryPreflightFixture.configuration(member: member), status: .paused, fault: fault))
        if fault != nil {
            do {
                try await model.stageRecurringResume(input, context: context)
                XCTFail("Changed or unavailable recurring context created a new request")
            } catch { XCTAssertTrue(error is NestAPIFailure) }
            let saved = try await model.savedRecurringResume(context)
            XCTAssertNil(saved)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            return
        }
        try await model.stageRecurringResume(input, context: context)
        let staged = try await model.savedRecurringResume(context)
        do {
            _ = try await model.retryRecurringResume(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedRecurringResume(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        let recovered = try await model.retryRecurringResume(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryRecurringResume(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor LostRecurringResumeReplyServer {
    let member: VerifiedMember
    var receipt: RecurringResumeReceipt?
    var saves = 0
    var preflight: RecurringEntryPreflightFixture?
    func prepare(_ value: RecurringEntryPreflightFixture) { preflight = value }
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if let result = try preflight?.respond(request) { return result }
        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveRecurringResume.self, from: request.httpBody!)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, revision: UUID(),
                status: .active, change: command.change,
                configuration: .init(
                    description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
                    startDate: try CivilDate("2026-09-01"),
                    schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
                    mode: .variable, amountCentimes: nil, allocations: nil), coveredThrough: nil)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = RecurringResumeRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
