import Foundation
import XCTest

@testable import Nest

@MainActor
final class VariableCycleCancellationRestartTests: XCTestCase {
    func testLostCancellationReplySurvivesRestartWithoutPostingBill() async throws {
        try await verifyRestart(committed: false)
    }

    func testCancellationAfterLostSaveRecoversRecordedBillWithoutReposting() async throws {
        try await verifyRestart(committed: true)
    }

    private func verifyRestart(committed: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let server = VariableCycleCancellationServer(member: member, partner: partner)
        let url = FileManager.default.temporaryDirectory.appending(path: "variableCycle-cancel-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let first = try makeModel(member: member, partner: partner, server: server, url: url)
        await first.restore()
        let context = try first.expenseContext()
        let input = VariableCycleInput(
            ruleId: UUID(), expectedRevision: UUID(), dueOn: try CivilDate("2026-09-28"),
            amountCentimes: try Centimes("101"),
            allocations: try ExpenseSplit.equal(Centimes("101"), payer: member.userId, other: partner))
        try await server.prepare(input)
        try await first.stageVariableCycle(input, context: context)
        let staged = try await first.savedVariableCycle(context)
        let original = try XCTUnwrap(staged)
        await server.expect(original.command)
        do {
            if committed {
                _ = try await first.retryVariableCycle(context)
            } else {
                _ = try await first.cancelVariableCycle(context)
            }
            XCTFail("Lost reply cannot establish a terminal result")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await first.savedVariableCycle(context)
        XCTAssertEqual(pending?.command, original.command)
        XCTAssertEqual(pending?.cancellationRequested, !committed)
        XCTAssertNil(pending?.result?.receipt)
        let reopened = try makeModel(member: member, partner: partner, server: server, url: url)
        await reopened.restore()
        let restoredContext = try reopened.expenseContext()
        let restored = try await reopened.savedVariableCycle(restoredContext)
        XCTAssertEqual(restored?.command, original.command)
        XCTAssertEqual(restored?.cancellationRequested, !committed)
        let result = try await reopened.cancelVariableCycle(restoredContext)
        XCTAssertEqual(result.command, original.command)
        XCTAssertEqual(result.result?.status, committed ? .recorded : .cancelled)
        XCTAssertEqual(result.result?.receipt?.input, committed ? input : nil)
        let counts = await server.counts()
        XCTAssertEqual(counts.saves, committed ? 1 : 0)
        XCTAssertEqual(counts.cancels, committed ? 1 : 2)
        try await reopened.finishVariableCycle(restoredContext, operation: original.command.operationId)
        let cleared = try await reopened.savedVariableCycle(restoredContext)
        XCTAssertNil(cleared)
    }

    private func makeModel(
        member: VerifiedMember, partner: UUID, server: VariableCycleCancellationServer, url: URL
    ) throws -> SessionModel {
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: partner, accessToken: "token-B"))
        let chores = FakeChoreServer(actorA: member.userId, actorB: partner, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await chores.respond($0) }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}

private actor VariableCycleCancellationServer {
    let member: VerifiedMember
    let partner: UUID
    private var preflight: RecurringEntryPreflightFixture?
    private var command: SaveVariableCycle?
    private var receipt: VariableCycleReceipt?
    private var saves = 0
    private var cancels = 0

    init(member: VerifiedMember, partner: UUID) {
        self.member = member
        self.partner = partner
    }

    func prepare(_ input: VariableCycleInput) throws {
        preflight = RecurringEntryPreflightFixture(
            member: member, partner: partner, ruleId: input.ruleId, revision: input.expectedRevision,
            configuration: try RecurringEntryPreflightFixture.configuration(member: member), status: .active, fault: nil
        )
    }

    func counts() -> (saves: Int, cancels: Int) { (saves, cancels) }

    func expect(_ command: SaveVariableCycle) { self.command = command }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if let value = try preflight?.respond(request) { return value }
        if request.url!.path.hasSuffix("/save") {
            let input = try JSONDecoder().decode(SaveVariableCycle.self, from: request.httpBody!)
            XCTAssertEqual(input, command)
            saves += 1
            let config = try RecurringEntryPreflightFixture.configuration(member: member)
            let expense = ExpenseInput(
                description: config.description, amountCentimes: input.input.amountCentimes,
                receiptPath: nil, receiptTotalCentimes: nil, payerId: config.payerId,
                allocations: input.input.allocations, date: input.input.dueOn, note: config.note,
                categoryId: config.categoryId)
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, approvalId: nil, source: "variable", eventId: UUID(),
                input: input.input,
                cycle: try RecurringDates.cycle(schedule: config.schedule, dueOn: input.input.dueOn),
                configuration: config, expense: expense)
            throw URLError(.networkConnectionLost)
        }
        let operation: UUID
        if request.url!.path.hasSuffix("/cancel-save") {
            struct Cancellation: Decodable { let operationId: UUID }
            let input = try JSONDecoder().decode(Cancellation.self, from: request.httpBody!)
            XCTAssertEqual(input.operationId, command?.operationId)
            operation = input.operationId
            cancels += 1
            if cancels == 1 && receipt == nil { throw URLError(.networkConnectionLost) }
        } else if request.url!.path.hasSuffix("/receipt") {
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            operation = UUID(uuidString: query.first(where: { $0.name == "operationId" })!.value!)!
            XCTAssertEqual(operation, command?.operationId)
        } else {
            throw NestAPIFailure.contract
        }
        return try response(
            VariableCycleRecovery(
                version: 1, actorId: member.userId, householdId: member.householdId, operationId: operation,
                status: receipt != nil ? .recorded : cancels > 0 ? .cancelled : .unresolved, receipt: receipt),
            request: request)
    }

    private func response<T: Encodable>(_ value: T, request: URLRequest) throws -> (Data, URLResponse) {
        (
            try JSONEncoder().encode(value),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}
