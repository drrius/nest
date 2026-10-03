import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyConfirmationTestFixture {
    let base: ManualCycleTestFixture
    let session: SessionModel
    let server: LegacyConfirmationTestServer

    static func make() async throws -> Self {
        let base = try await ManualCycleTestFixture.make()
        let draft = LegacyRecurringDraft(
            draftId: UUID(), ruleId: UUID(), description: "Original fictional draft",
            amountCentimes: try Centimes("101"), payerId: base.member.userId,
            allocations: .init(
                kind: .valid,
                shares: try ExpenseSplit.equal(Centimes("101"), payer: base.member.userId, other: base.partner.userId),
                reason: nil), categoryId: nil, sourceKind: .recurring, shoppingSessionId: nil,
            occurredOn: .init(kind: .date, value: "2026-01-05", reason: nil), status: .pending,
            updatedAt: .init(kind: .timestamp, value: "2026-01-01T10:00:00.123456Z", reason: nil), eventId: nil)
        let server = LegacyConfirmationTestServer(
            member: base.member, partner: base.partner,
            context: .init(
                version: 1, householdId: base.member.householdId, draft: draft,
                reviewToken: try LegacyReviewToken(String(repeating: "a", count: 64))))
        let session = try makeSession(base: base, server: server)
        await session.restore()
        return .init(base: base, session: session, server: server)
    }

    func presentation(session: SessionModel? = nil, member: VerifiedMember? = nil) async -> LegacyConfirmationModel {
        LegacyConfirmationModel(
            session: session ?? self.session, member: member ?? base.member, draftId: await server.draftId)
    }

    func expense() throws -> ExpenseInput {
        try ExpenseInput(
            description: "New explicit expense", amountCentimes: Centimes("201"),
            receiptPath: nil, receiptTotalCentimes: nil, payerId: base.member.userId,
            allocations: ExpenseSplit.equal(Centimes("201"), payer: base.member.userId, other: base.partner.userId),
            date: CivilDate("2026-10-03"), note: "New note", categoryId: nil
        ).validated(member: base.member)
    }

    func reviewedModel(session: SessionModel? = nil, member: VerifiedMember? = nil) async throws
        -> LegacyConfirmationModel
    {
        let model = await presentation(session: session, member: member)
        await model.load()
        try model.prepare(expense())
        return model
    }

    func reopenedSession() async throws -> SessionModel {
        let session = try Self.makeSession(base: base, server: server)
        await session.restore()
        return session
    }

    private static func makeSession(base: ManualCycleTestFixture, server: LegacyConfirmationTestServer) throws
        -> SessionModel
    {
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await base.chores.respond($0)
        }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        return SessionModel(
            auth: base.auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: base.url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
    }
}

actor LegacyConfirmationTestServer {
    let member: VerifiedMember
    let partner: VerifiedMember
    let original: LegacyDraftContext
    private var receipts: [UUID: LegacyConfirmationReceipt] = [:]
    private var cancellations: [UUID: UUID] = [:]
    private var fault = "none"
    private var lostSave = false
    private var failedSave = false
    private var lostCancellation = false
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    private(set) var writes = 0
    private(set) var cancellationWrites = 0
    var draftId: UUID { original.draft.id }

    init(member: VerifiedMember, partner: VerifiedMember, context: LegacyDraftContext) {
        self.member = member
        self.partner = partner
        original = context
    }
    func setFault(_ value: String) { fault = value }
    func loseNextSave() { lostSave = true }
    func failNextSave() { failedSave = true }
    func loseNextCancellation() { lostCancellation = true }
    func pauseNextRead() { pause = true }
    func waitForRead() async {
        if waiting { return }
        await withCheckedContinuation { began = $0 }
    }
    func releaseRead() {
        resume?.resume()
        resume = nil
        waiting = false
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard fault != "offline" else { throw URLError(.notConnectedToInternet) }
        let owner: VerifiedMember
        switch request.value(forHTTPHeaderField: "Authorization") {
        case "Bearer token-A": owner = member
        case "Bearer token-B": owner = partner
        default: throw NestAPIFailure.forbidden
        }
        guard request.value(forHTTPHeaderField: "x-nest-household") == owner.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let url = try XCTUnwrap(request.url)
        let data: Data
        switch url.lastPathComponent {
        case "balance":
            data = try JSONEncoder().encode(balance(owner: owner))
        case "context":
            guard request.httpMethod == "GET", query(request, key: "draftId") == draftId else {
                throw NestAPIFailure.contract
            }
            data = try JSONEncoder().encode(current())
        case "receipt":
            guard request.httpMethod == "GET", let operation = query(request, key: "operationId") else {
                throw NestAPIFailure.contract
            }
            data = try JSONEncoder().encode(recovery(operation, owner: owner))
        case "save":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let command = try JSONDecoder().decode(SaveLegacyConfirmation.self, from: XCTUnwrap(request.httpBody))
            data = try save(command, owner: owner)
        case "cancel-save":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let body = try JSONSerialization.jsonObject(with: XCTUnwrap(request.httpBody)) as? [String: String]
            guard body?.count == 1, let operation = body?["operationId"].flatMap(UUID.init(uuidString:)) else {
                throw NestAPIFailure.contract
            }
            cancellationWrites += 1
            if receipts[operation] == nil { cancellations[operation] = owner.userId }
            if lostCancellation {
                lostCancellation = false
                throw URLError(.networkConnectionLost)
            }
            data = try JSONEncoder().encode(recovery(operation, owner: owner))
        default: throw NestAPIFailure.contract
        }
        if pause && request.httpMethod == "GET" {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ command: SaveLegacyConfirmation, owner: VerifiedMember) throws -> Data {
        if failedSave {
            failedSave = false
            throw URLError(.networkConnectionLost)
        }
        if let receipt = receipts[command.operationId] {
            _ = try receipt.validated(member: owner, command: command)
            return try JSONEncoder().encode(receipt)
        }
        let reviewed = try current().validated(member: owner, draftId: command.input.draftId)
        guard reviewed.canDismiss, reviewed.dismissalInput == command.input.retainedInput,
            cancellations[command.operationId] == nil
        else { throw NestAPIFailure.conflict }
        _ = try command.input.validated(member: owner)
        _ = try command.input.expense.validated(member: owner, balance: balance(owner: owner))
        let receipt = LegacyConfirmationReceipt(
            version: 1, actorId: owner.userId, householdId: owner.householdId, operationId: command.operationId,
            approvalId: nil, input: command.input, reviewed: reviewed, eventId: UUID(), status: "posted")
        receipts[command.operationId] = receipt
        writes += 1
        if lostSave {
            lostSave = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(receipt)
    }

    private func recovery(_ operation: UUID, owner: VerifiedMember) throws -> LegacyConfirmationRecovery {
        let receipt = receipts[operation]
        guard receipt == nil || receipt?.actorId == owner.userId,
            cancellations[operation] == nil || cancellations[operation] == owner.userId
        else { throw NestAPIFailure.forbidden }
        return .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId, operationId: operation,
            status: receipt != nil ? .recorded : cancellations[operation] != nil ? .cancelled : .unresolved,
            receipt: receipt)
    }

    private func balance(owner: VerifiedMember) -> MoneyBalance {
        .init(
            version: 1, householdId: member.householdId, eventCount: "0", openingEstablished: false,
            members: [
                .init(actorId: member.userId, displayName: "Alex", centimes: try! Centimes("0")),
                .init(
                    actorId: fault == "members" ? UUID() : partner.userId, displayName: "Sam",
                    centimes: try! Centimes("0")),
            ])
    }

    private func current() throws -> LegacyDraftContext {
        var raw = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        var draft = try XCTUnwrap(raw["draft"] as? [String: Any])
        if fault == "token" { raw["reviewToken"] = String(repeating: "b", count: 64) }
        if fault == "scope" { raw["householdId"] = UUID().uuidString }
        if fault == "terms" { draft["description"] = "Changed but same raw-token fixture" }
        if fault == "linked" { draft["eventId"] = UUID().uuidString }
        if fault == "posted" { draft["status"] = "posted" }
        if fault == "shopping" {
            draft["sourceKind"] = "shopping"
            draft["shoppingSessionId"] = UUID().uuidString
        }
        if !receipts.isEmpty { draft["status"] = "posted" }
        raw["draft"] = draft
        return try JSONDecoder().decode(LegacyDraftContext.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    private func query(_ request: URLRequest, key: String) -> UUID? {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { $0.name == key })?.value.flatMap(UUID.init(uuidString:))
    }
}
