import Foundation
import XCTest

@testable import Nest

actor LegacyAdoptionTestServer {
    let member: VerifiedMember
    let partner: VerifiedMember
    let original: LegacyAdoptionContext
    private var receipts: [UUID: LegacyAdoptionReceipt] = [:]
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
    var ruleId: UUID { original.rule.id }

    init(member: VerifiedMember, partner: VerifiedMember, context: LegacyAdoptionContext) {
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
        let owner = try requestOwner(request)
        let url = try XCTUnwrap(request.url)
        let data: Data
        switch url.lastPathComponent {
        case "rules":
            data = try rulesData(request, owner: owner)
        case "balance":
            data = try JSONEncoder().encode(balance(owner: owner))
        case "context":
            data = try contextData(request)
        case "receipt":
            guard request.httpMethod == "GET", let operation = query(request, key: "operationId") else {
                throw NestAPIFailure.contract
            }
            data = try JSONEncoder().encode(recovery(operation, owner: owner))
        case "save":
            guard request.httpMethod == "POST" else { throw NestAPIFailure.contract }
            let command = try JSONDecoder().decode(SaveLegacyAdoption.self, from: XCTUnwrap(request.httpBody))
            data = try save(command, owner: owner)
        case "cancel-save":
            data = try cancelData(request, owner: owner)
        default: throw NestAPIFailure.contract
        }
        await pauseRead(request)
        return (data, HTTPURLResponse(url: url, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func rulesData(_ request: URLRequest, owner: VerifiedMember) throws -> Data {
        return try JSONEncoder().encode(
            RecurringList(
                version: 1, householdId: owner.householdId,
                today: CivilDate(fault == "day" ? "2026-10-04" : "2026-10-03"), after: nil, next: nil, rules: []))
    }

    private func requestOwner(_ request: URLRequest) throws -> VerifiedMember {
        let owner: VerifiedMember
        switch request.value(forHTTPHeaderField: "Authorization") {
        case "Bearer token-A": owner = member
        case "Bearer token-B": owner = partner
        default: throw NestAPIFailure.forbidden
        }
        guard request.value(forHTTPHeaderField: "x-nest-household") == owner.householdId.uuidString.lowercased()
        else { throw NestAPIFailure.forbidden }
        return owner
    }

    private func pauseRead(_ request: URLRequest) async {
        if pause && request.httpMethod == "GET" {
            pause = false
            waiting = true
            began?.resume()
            began = nil
            await withCheckedContinuation { resume = $0 }
        }
    }

    private func cancelData(_ request: URLRequest, owner: VerifiedMember) throws -> Data {
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
        return try JSONEncoder().encode(recovery(operation, owner: owner))
    }

    private func save(_ command: SaveLegacyAdoption, owner: VerifiedMember) throws -> Data {
        if failedSave {
            failedSave = false
            throw URLError(.networkConnectionLost)
        }
        if let receipt = receipts[command.operationId] {
            _ = try receipt.validated(member: owner, command: command)
            return try JSONEncoder().encode(receipt)
        }
        let reviewed = try current().validated(member: owner, ruleId: command.input.ruleId)
        guard cancellations[command.operationId] == nil else { throw NestAPIFailure.conflict }
        _ = try command.input.validated(
            member: owner, balance: balance(owner: owner), review: reviewed,
            today: CivilDate(fault == "day" ? "2026-10-04" : "2026-10-03"))
        let receipt = LegacyAdoptionReceipt(
            version: 1, actorId: owner.userId, householdId: owner.householdId, operationId: command.operationId,
            approvalId: nil, input: command.input, reviewed: reviewed, revision: UUID(), status: "active")
        receipts[command.operationId] = receipt
        writes += 1
        if lostSave {
            lostSave = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(receipt)
    }

    private func recovery(_ operation: UUID, owner: VerifiedMember) throws -> LegacyAdoptionRecovery {
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

    private func current() throws -> LegacyAdoptionContext {
        var raw = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(original)) as? [String: Any])
        var rule = try XCTUnwrap(raw["rule"] as? [String: Any])
        switch fault {
        case "token": raw["reviewToken"] = String(repeating: "b", count: 64)
        case "scope": raw["householdId"] = UUID().uuidString
        case "terms": rule["description"] = "Changed but same raw-token fixture"
        case "coverage": raw["coveredThrough"] = "2026-11-05"
        case "pending":
            var counts = try XCTUnwrap(rule["drafts"] as? [String: Any])
            counts["pending"] = "1"
            rule["drafts"] = counts
            raw["blockers"] = ["pending_drafts"]
        case "identity": raw["blockers"] = ["native_identity_in_use"]
        default: break
        }
        raw["rule"] = rule
        if let receipt = receipts.values.first {
            raw["blockers"] = ["already_adopted"]
            raw["adoption"] = [
                "nativeRuleId": ruleId.uuidString, "authorizedBy": receipt.actorId.uuidString,
                "authorizedAt": "2026-10-03T12:00:00Z",
            ]
        }
        return try JSONDecoder().decode(LegacyAdoptionContext.self, from: JSONSerialization.data(withJSONObject: raw))
    }

    private func query(_ request: URLRequest, key: String) -> UUID? {
        URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems?
            .first(where: { $0.name == key })?.value.flatMap(UUID.init(uuidString:))
    }

    private func contextData(_ request: URLRequest) throws -> Data {
        guard request.httpMethod == "GET", query(request, key: "ruleId") == ruleId else {
            throw NestAPIFailure.contract
        }
        return try JSONEncoder().encode(current())
    }

}
