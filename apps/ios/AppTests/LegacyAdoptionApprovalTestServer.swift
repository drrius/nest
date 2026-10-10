import Foundation
import XCTest

@testable import Nest

actor LegacyAdoptionApprovalTestServer {
    let owner: VerifiedMember
    let original: LegacyAdoptionContext
    let source: LegacyAdoptionTestServer
    let input: LegacyAdoptionInput
    let approvalId = UUID()
    let operationId = UUID()
    private var status = LegacyAdoptionApproval.Status.pending
    private var receipt: LegacyAdoptionReceipt?
    private var expiresAt = "2099-12-31T00:00:00.000000Z"
    private var loseReply = false
    private var failReply = false
    private var offline = false
    private var contextMissing = false
    private var categoryRemoved = false
    private(set) var categoryReads: [UUID] = []
    private(set) var sends = 0
    private(set) var postings = 0
    private(set) var lastDecision: LegacyAdoptionDecision?

    init(
        owner: VerifiedMember, original: LegacyAdoptionContext, source: LegacyAdoptionTestServer,
        input: LegacyAdoptionInput
    ) {
        self.owner = owner
        self.original = original
        self.source = source
        self.input = input
    }
    func loseNextReply() { loseReply = true }
    func failNextReply() { failReply = true }
    func setOffline(_ value: Bool) { offline = value }
    func hideRuleContext() { contextMissing = true }
    func removeCategory() { categoryRemoved = true }
    func expire() { expiresAt = "2000-01-01T00:00:00.000000Z" }
    func commitApproved() {
        guard !envelope().approval.isTerminal else { return }
        receipt = .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            operationId: operationId, approvalId: approvalId, input: input,
            reviewed: original, revision: UUID(), status: "active")
        status = .consumed
        postings += 1
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        guard !offline else { throw URLError(.notConnectedToInternet) }
        guard request.value(forHTTPHeaderField: "Authorization") == "Bearer token-A",
            request.value(forHTTPHeaderField: "x-nest-household") == owner.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        let url = try XCTUnwrap(request.url)
        let data: Data
        switch url.path {
        case "/v1/money/category": data = try categoryResponse(request)
        case "/v1/money/recurring/legacy-adoption/approval":
            try query(request)
            data = try JSONEncoder().encode(envelope())
        case "/v1/money/recurring/legacy-adoption/approval/context":
            try query(request)
            if contextMissing {
                return (Data(), HTTPURLResponse(url: url, statusCode: 403, httpVersion: nil, headerFields: nil)!)
            }
            data = try JSONEncoder().encode(await currentContext())
        case "/v1/money/recurring/legacy-adoption/approval/decide":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let decision = try JSONDecoder().decode(LegacyAdoptionDecision.self, from: XCTUnwrap(request.httpBody))
            data = try await decide(decision)
        case "/v1/money/balance", "/v1/money/recurring/rules": return try await source.respond(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func query(_ request: URLRequest) throws {
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard request.httpMethod == "GET", items.count == 1, items[0].name == "approvalId",
            items[0].value.flatMap(UUID.init(uuidString:)) == approvalId
        else { throw NestAPIFailure.contract }
    }

    private func categoryResponse(_ request: URLRequest) throws -> Data {
        let items = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems ?? []
        guard request.httpMethod == "GET", items.count == 1, items[0].name == "categoryId",
            let id = items[0].value.flatMap(UUID.init(uuidString:)), id == input.configuration.categoryId
        else { throw NestAPIFailure.contract }
        categoryReads.append(id)
        return try JSONEncoder().encode(
            MoneyCategoryEnvelope(
                version: 1, householdId: owner.householdId, categoryId: id,
                category: categoryRemoved ? nil : .init(categoryId: id, name: "Shared bills", archived: false)))
    }

    private func envelope() -> LegacyAdoptionApprovalEnvelope {
        .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId,
            approval: .init(
                id: approvalId, operationId: operationId, input: input,
                status: status, expiresAt: expiresAt, receipt: receipt))
    }

    private func currentContext() async throws -> LegacyAdoptionProposalContext {
        let path = "https://nest.example/v1/money/recurring/legacy-adoption/context"
        var request = URLRequest(
            url: URL(
                string: "\(path)?ruleId=\(original.rule.id.uuidString.lowercased())"
            )!)
        request.httpMethod = "GET"
        request.setValue("Bearer token-A", forHTTPHeaderField: "Authorization")
        request.setValue(owner.householdId.uuidString.lowercased(), forHTTPHeaderField: "x-nest-household")
        let response = try await source.respond(request)
        let reviewed = try JSONDecoder().decode(LegacyAdoptionContext.self, from: response.0)
        return .init(
            version: 1, actorId: owner.userId, householdId: owner.householdId, approvalId: approvalId,
            input: input, review: reviewed)
    }

    private func moneyRead<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        var request = URLRequest(url: URL(string: "https://nest.example/v1/money/\(path)")!)
        request.httpMethod = "GET"
        request.setValue("Bearer token-A", forHTTPHeaderField: "Authorization")
        request.setValue(owner.householdId.uuidString.lowercased(), forHTTPHeaderField: "x-nest-household")
        let response = try await source.respond(request)
        return try JSONDecoder().decode(type, from: response.0)
    }

    private func decide(_ decision: LegacyAdoptionDecision) async throws -> Data {
        _ = try envelope().matching(decision, member: owner)
        sends += 1
        lastDecision = decision
        if failReply {
            failReply = false
            throw URLError(.networkConnectionLost)
        }
        if !envelope().approval.isTerminal {
            if decision.approved {
                let current = try await currentContext()
                guard current.matches, ApprovalTime.isOpen(expiresAt, now: .now) else {
                    throw NestAPIFailure.conflict
                }
                let balance = try await moneyRead("balance", as: MoneyBalance.self)
                let rules = try await moneyRead("recurring/rules", as: RecurringList.self)
                _ = try input.validated(member: owner, balance: balance, review: current.review, today: rules.today)
                commitApproved()
            } else {
                status = .denied
            }
        }
        if loseReply {
            loseReply = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(envelope())
    }
}
