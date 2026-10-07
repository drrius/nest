import Foundation
import XCTest

@testable import Nest

@MainActor
final class VariableCycleRecoveryModelTests: XCTestCase {
    func testLostSaveReplyRecoversWithoutSubmittingAgain() async throws {
        try await verifyEntry(fault: nil)
    }

    func testFreshPreflightRefusesOfflineOrChangedRuleBeforeJournaling() async throws {
        for fault in ["offline", "household", "member", "revision", "state", "covered"] {
            try await verifyEntry(fault: fault)
        }
    }

    private func verifyEntry(fault: String?) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let server = LostVariableCycleReplyServer(member: member)
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "variable-cycle-recovery-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let model = SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: http))
        await model.restore()
        let context = try model.expenseContext()
        let shares = try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner)
        let input = VariableCycleInput(
            ruleId: UUID(), expectedRevision: UUID(),
            dueOn: try CivilDate("2026-09-28"), amountCentimes: try Centimes("101"), allocations: shares)
        let preflight = RecurringEntryPreflightFixture(
            member: member, partner: partner, ruleId: input.ruleId, revision: input.expectedRevision,
            configuration: try RecurringEntryPreflightFixture.configuration(member: member),
            status: .active, fault: fault)
        await server.prepare(preflight)
        if fault != nil {
            do {
                try await model.stageVariableCycle(input, context: context)
                XCTFail("Changed or unavailable recurring context created a new request")
            } catch { XCTAssertTrue(error is NestAPIFailure) }
            let saved = try await model.savedVariableCycle(context)
            XCTAssertNil(saved)
            let saves = await server.saves
            XCTAssertEqual(saves, 0)
            return
        }
        try await model.stageVariableCycle(input, context: context)
        let staged = try await model.savedVariableCycle(context)
        do {
            _ = try await model.retryVariableCycle(context)
            XCTFail("Lost reply was reported as success")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await model.savedVariableCycle(context)
        XCTAssertEqual(pending?.command, staged?.command)
        XCTAssertNil(pending?.result?.receipt)
        try await verifyLocalDiscovery(model, context: context, command: staged?.command, server: server)
        let recovered = try await model.retryVariableCycle(context)
        XCTAssertEqual(recovered.result?.status, .recorded)
        XCTAssertEqual(recovered.command, staged?.command)
        let saves = await server.saves
        XCTAssertEqual(saves, 1)
        await model.signOut()
        do {
            _ = try await model.retryVariableCycle(context)
            XCTFail("Signed-out context reused")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        do {
            _ = try await model.savedVariableBillEntry(member: member, generation: context.generation)
            XCTFail("Signed-out saved entry disclosed")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
    }

    private func verifyLocalDiscovery(
        _ model: SessionModel, context: ExpenseContext,
        command: SaveVariableCycle?, server: LostVariableCycleReplyServer
    ) async throws {
        let member = context.member
        let before = await server.requests
        let saved = try await model.savedVariableBillEntry(member: member, generation: context.generation)
        XCTAssertEqual(saved?.command, command)
        let wrong = VerifiedMember(userId: UUID(), householdId: member.householdId, displayName: "Other")
        do {
            _ = try await model.savedVariableBillEntry(member: wrong, generation: context.generation)
            XCTFail("Another member discovered the local bill")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        do {
            _ = try await model.savedVariableBillEntry(member: member, generation: context.generation + 1)
            XCTFail("A stale generation discovered the local bill")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .signedOut) }
        let after = await server.requests
        XCTAssertEqual(after, before, "Local recovery discovery must not need a live rule or financial read")
    }
}

private actor LostVariableCycleReplyServer {
    let member: VerifiedMember
    var receipt: VariableCycleReceipt?
    var saves = 0
    var requests = 0
    var preflight: RecurringEntryPreflightFixture?
    func prepare(_ value: RecurringEntryPreflightFixture) { preflight = value }
    init(member: VerifiedMember) { self.member = member }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        requests += 1
        if let result = try preflight?.respond(request) { return result }
        if request.url!.path.hasSuffix("/save") {
            let command = try JSONDecoder().decode(SaveVariableCycle.self, from: request.httpBody!)
            saves += 1
            let input = command.input
            let config = RecurringConfiguration(
                description: "Bill", payerId: member.userId,
                categoryId: nil, note: nil, startDate: input.dueOn,
                schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28), mode: .variable,
                amountCentimes: nil, allocations: nil)
            let expense = ExpenseInput(
                description: "Bill", amountCentimes: input.amountCentimes,
                receiptPath: nil, receiptTotalCentimes: nil, payerId: member.userId,
                allocations: input.allocations, date: input.dueOn, note: nil, categoryId: nil)
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, approvalId: nil, source: "variable", eventId: UUID(),
                input: input, cycle: try RecurringDates.cycle(schedule: config.schedule, dueOn: input.dueOn),
                configuration: config, expense: expense)
            throw URLError(.networkConnectionLost)
        }
        let operation = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            .first(where: { $0.name == "operationId" })!.value!
        let result = VariableCycleRecovery(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: UUID(uuidString: operation)!, status: receipt == nil ? .unresolved : .recorded,
            receipt: receipt)
        return (
            try JSONEncoder().encode(result),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
