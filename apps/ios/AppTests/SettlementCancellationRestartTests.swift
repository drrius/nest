import Foundation
import XCTest

@testable import Nest

@MainActor
final class SettlementCancellationRestartTests: XCTestCase {
    func testLostCancellationReplySurvivesRestartWithoutPostingPayment() async throws {
        try await verifyRestart(committed: false)
    }

    func testCancellationAfterLostSaveRecoversRecordedPaymentWithoutReposting() async throws {
        try await verifyRestart(committed: true)
    }

    private func verifyRestart(committed: Bool) async throws {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let partner = UUID()
        let server = SettlementCancellationServer(member: member, partner: partner)
        let url = FileManager.default.temporaryDirectory.appending(path: "settlement-cancel-\(UUID()).sqlite")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let first = try makeModel(member: member, partner: partner, server: server, url: url)
        await first.restore()
        let context = try first.expenseContext()
        let input = SettlementInput(
            description: "Already paid", amountCentimes: try Centimes("101"),
            expectedOutstandingCentimes: try Centimes("101"), payerId: member.userId,
            recipientId: partner, mode: .full, date: try CivilDate("2026-10-07"), note: nil)
        try await first.stageSettlement(input, context: context)
        let staged = try await first.savedSettlement(context)
        let original = try XCTUnwrap(staged)
        await server.expect(original.command)
        do {
            if committed {
                _ = try await first.retrySettlement(context)
            } else {
                _ = try await first.cancelSettlement(context)
            }
            XCTFail("Lost reply cannot establish a terminal result")
        } catch { XCTAssertEqual(error as? NestAPIFailure, .unavailable) }
        let pending = try await first.savedSettlement(context)
        XCTAssertEqual(pending?.command, original.command)
        XCTAssertEqual(pending?.cancellationRequested, !committed)
        XCTAssertNil(pending?.result?.receipt)
        let reopened = try makeModel(member: member, partner: partner, server: server, url: url)
        await reopened.restore()
        let restoredContext = try reopened.expenseContext()
        let restored = try await reopened.savedSettlement(restoredContext)
        XCTAssertEqual(restored?.command, original.command)
        XCTAssertEqual(restored?.cancellationRequested, !committed)
        let result = try await reopened.cancelSettlement(restoredContext)
        XCTAssertEqual(result.command, original.command)
        XCTAssertEqual(result.result?.status, committed ? .recorded : .cancelled)
        XCTAssertEqual(result.result?.receipt?.settlement, committed ? input : nil)
        let counts = await server.counts()
        XCTAssertEqual(counts.saves, committed ? 1 : 0)
        XCTAssertEqual(counts.cancels, committed ? 1 : 2)
        try await reopened.finishSettlement(restoredContext, operation: original.command.operationId)
        let cleared = try await reopened.savedSettlement(restoredContext)
        XCTAssertNil(cleared)
    }

    private func makeModel(
        member: VerifiedMember, partner: UUID, server: SettlementCancellationServer, url: URL
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

private actor SettlementCancellationServer {
    let member: VerifiedMember
    let partner: UUID
    private var command: SaveSettlement?
    private var receipt: SettlementReceipt?
    private var saves = 0
    private var cancels = 0

    init(member: VerifiedMember, partner: UUID) {
        self.member = member
        self.partner = partner
    }

    func counts() -> (saves: Int, cancels: Int) { (saves, cancels) }

    func expect(_ command: SaveSettlement) { self.command = command }

    func respond(_ request: URLRequest) throws -> (Data, URLResponse) {
        if request.url!.path == "/v1/money/balance" {
            return try response(
                MoneyBalance(
                    version: 1, householdId: member.householdId, eventCount: "1", openingEstablished: true,
                    members: [
                        .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("-101")),
                        .init(actorId: partner, displayName: "Sam", centimes: try Centimes("101")),
                    ]), request: request)
        }
        if request.url!.path.hasSuffix("/save") {
            let input = try JSONDecoder().decode(SaveSettlement.self, from: request.httpBody!)
            XCTAssertEqual(input, command)
            saves += 1
            receipt = .init(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: input.operationId, eventId: UUID(), approvalId: nil, settlement: input.settlement)
            throw URLError(.networkConnectionLost)
        }
        let operation: UUID
        if request.url!.path.hasSuffix("/cancel") {
            struct Cancellation: Decodable { let operationId: UUID }
            let input = try JSONDecoder().decode(Cancellation.self, from: request.httpBody!)
            XCTAssertEqual(input.operationId, command?.operationId)
            operation = input.operationId
            cancels += 1
            if cancels == 1 && receipt == nil { throw URLError(.networkConnectionLost) }
        } else {
            let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
            operation = UUID(uuidString: query.first(where: { $0.name == "operationId" })!.value!)!
        }
        return try response(
            SettlementRecovery(
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
