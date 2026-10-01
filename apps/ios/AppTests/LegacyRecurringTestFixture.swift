import Foundation
import XCTest

@testable import Nest

@MainActor
struct LegacyRecurringTestFixture {
    let base: ManualCycleTestFixture
    let session: SessionModel
    let server: LegacyRecurringTestServer

    static func make() async throws -> Self {
        let base = try await ManualCycleTestFixture.make()
        let server = LegacyRecurringTestServer(member: base.member, partner: base.partner)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await base.chores.respond($0)
        }
        let moneyHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let session = SessionModel(
            auth: base.auth, chores: ChoreAPI(http: choreHTTP), offline: try ChoreOfflineStore(url: base.url),
            moneyAPI: MoneyAPI(http: moneyHTTP))
        await session.restore()
        return .init(base: base, session: session, server: server)
    }
}

actor LegacyRecurringTestServer {
    let member: VerifiedMember
    let partner: VerifiedMember
    private var fault = "none"
    private var pause = false
    private var waiting = false
    private var began: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?
    private(set) var writes = 0
    private(set) var reads = 0
    var ruleId: UUID { Self.id(800) }

    init(member: VerifiedMember, partner: VerifiedMember) {
        self.member = member
        self.partner = partner
    }
    func setFault(_ value: String) { fault = value }
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
        guard request.httpMethod == "GET" else {
            writes += 1
            throw NestAPIFailure.contract
        }
        guard let bearer = request.value(forHTTPHeaderField: "Authorization"),
            ["Bearer token-A", "Bearer token-B"].contains(bearer),
            request.value(forHTTPHeaderField: "x-nest-household") == member.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        reads += 1
        if fault == "offline" { throw URLError(.notConnectedToInternet) }
        let url = try XCTUnwrap(request.url)
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let after = query.first(where: { $0.name == "after" })?.value
        let isDraft = url.path == "/v1/money/recurring/legacy-drafts"
        guard isDraft || url.path == "/v1/money/recurring/legacy" else { throw NestAPIFailure.contract }
        let allowed = isDraft ? ["ruleId", "after"] : ["after"]
        guard query.allSatisfy({ allowed.contains($0.name) }), Set(query.map(\.name)).count == query.count,
            !isDraft || query.first(where: { $0.name == "ruleId" })?.value == ruleId.uuidString.lowercased()
        else { throw NestAPIFailure.contract }
        let start = after == nil ? 0 : 20
        let ids = (start..<(after == nil ? 20 : 21)).map { Self.id((isDraft ? 900 : 800) + $0) }
        let rows = ids.map { isDraft ? draft($0) : rule($0) }
        var page: [String: Any] = [
            "version": 1, "householdId": member.householdId.uuidString.lowercased(),
            "after": after as Any? ?? NSNull(),
            "next": after == nil ? ids.last!.uuidString.lowercased() as Any : NSNull(),
            isDraft ? "drafts" : "rules": rows,
        ]
        if isDraft { page["ruleId"] = ruleId.uuidString.lowercased() }
        if fault == "scope" { page["householdId"] = UUID().uuidString.lowercased() }
        if fault == "cursor" { page["after"] = UUID().uuidString.lowercased() }
        if fault == "order" { page[isDraft ? "drafts" : "rules"] = [rows[0], rows[0]] }
        let data = try JSONSerialization.data(withJSONObject: page)
        if pause {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private var split: [String: Any] {
        ["kind": "valid", "shares": [
            ["memberId": member.userId.uuidString.lowercased(), "centimes": "4503599627370495"],
            ["memberId": partner.userId.uuidString.lowercased(), "centimes": "4503599627370496"],
        ]]
    }
    private func rule(_ id: UUID) -> [String: Any] {
        [
            "ruleId": id.uuidString.lowercased(), "mode": "legacy_draft_only", "description": "Changed old rule",
            "amountCentimes": "999", "payerId": member.userId.uuidString.lowercased(),
            "allocations": ["kind": "needs_review", "reason": "invalid_split"], "categoryId": NSNull(),
            "active": true, "nextOccurrenceOn": ["kind": "date", "value": "2026-01-05"],
            "updatedAt": ["kind": "timestamp", "value": "2026-01-01T10:00:00.123456Z"],
            "schedule": ["kind": "weekly", "weekday": 1],
            "drafts": ["pending": "21", "posted": "0", "dismissed": "0", "postedWithoutEvent": "0",
                "unpostedWithEvent": "0", "unsupportedDates": "0",
                "latestDraftOn": ["kind": "date", "value": "2026-01-05"]],
        ]
    }
    private func draft(_ id: UUID) -> [String: Any] {
        [
            "draftId": id.uuidString.lowercased(), "ruleId": ruleId.uuidString.lowercased(),
            "description": "Original draft", "amountCentimes": "9007199254740991",
            "payerId": member.userId.uuidString.lowercased(), "allocations": split, "categoryId": NSNull(),
            "sourceKind": "recurring", "shoppingSessionId": NSNull(),
            "occurredOn": ["kind": "date", "value": "2026-01-05"], "status": "pending",
            "updatedAt": ["kind": "timestamp", "value": "2026-01-01T10:00:00.123456Z"], "eventId": NSNull(),
        ]
    }
    private static func id(_ value: Int) -> UUID {
        UUID(uuidString: String(format: "00000000-0000-4000-8000-%012d", value))!
    }
}
