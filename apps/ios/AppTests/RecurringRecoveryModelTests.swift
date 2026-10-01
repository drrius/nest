import Foundation
import XCTest

@testable import Nest

@MainActor
final class RecurringRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyEntry(fault: nil)
    }

    func testFreshPreflightRefusesOfflineOrChangedRuleBeforeJournaling() async throws {
        for fault in ["offline", "household", "member", "day", "revision", "covered", "cancelled"] {
            try await verifyEntry(fault: fault)
        }
    }

    func testEditedRuleRecoversLostReplyWithoutSubmittingAgain() async throws {
        try await verifyEntry(fault: nil, editing: true)
    }

    private func verifyEntry(fault: String?, editing: Bool = false) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostRecurringReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "change-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let configuration = RecurringConfiguration(
            description: "Bill", payerId: fault == "member" ? partner : member.userId,
            categoryId: nil, note: nil, startDate: try CivilDate("2026-09-28"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28), mode: .variable,
            amountCentimes: nil, allocations: nil)
        let input = RecurringInput(
            ruleId: UUID(),
            expectedRevision: editing || ["revision", "covered", "cancelled"].contains(fault ?? "") ? UUID() : nil,
            configuration: configuration,
            firstDueOn: try CivilDate("2026-09-28"))
        await server.prepare(.init(
            member: member, partner: partner, ruleId: input.ruleId, revision: input.expectedRevision ?? UUID(), configuration: input.configuration,
            status: .active, fault: fault))
        if fault != nil {
            do {
                try await model.stageRecurring(input, context: context)
                XCTFail("Changed or unavailable recurring context created a new request")
            } catch { XCTAssertTrue(error is NestAPIFailure) }
            let saved = try await model.savedRecurring(context)
            XCTAssertNil(saved)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            return
        }
        try await model.stageRecurring(input, context: context)
        let staged = try await model.savedRecurring(context)
        do {
            _ = try await model.retryRecurring(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedRecurring(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        let recovered = try await model.retryRecurring(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryRecurring(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }
}

private actor LostRecurringReplyServer {
    let member: VerifiedMember
    var receipt: RecurringReceipt?
    var saves = 0
    var preflight: RecurringEntryPreflightFixture?
    func prepare(_ value: RecurringEntryPreflightFixture) { preflight = value }
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if let result = try preflight?.respond(request) { return result }
        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveRecurring.self, from: request.httpBody!)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, revision: UUID(),
                status: .active, rule: command.rule)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = RecurringRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
