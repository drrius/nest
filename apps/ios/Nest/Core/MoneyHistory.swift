import Foundation

struct MoneyEventSummary: Codable, Identifiable, Sendable {
    enum Kind: String, Codable {
        case openingBalance = "opening_balance"
        case expense, refund, settlement, reversal, replacement
    }
    let eventId: UUID
    let kind: Kind
    let occurredOn: String
    let createdAt: String
    let occurredOrder: String
    let createdOrder: String
    let description: String
    let amountCentimes: Centimes
    let createdBy: UUID
    let payerId: UUID?
    let relatedEventId: UUID?
    let hasReceipt: Bool
    var id: UUID { eventId }

    var valid: Bool {
        guard MoneyTime.date(occurredOn), MoneyTime.timestamp(createdAt),
            MoneyTime.order(occurredOrder), MoneyTime.order(createdOrder),
            !description.isEmpty, description.utf16.count <= 400, amountCentimes.value >= 0,
            kind == .reversal ? payerId == nil : payerId != nil, relatedEventId != eventId
        else { return false }
        if kind == .openingBalance { return true }
        let requiresRelated = kind == .refund || kind == .reversal || kind == .replacement
        return requiresRelated ? relatedEventId != nil : relatedEventId == nil
    }

    func precedes(_ other: Self) -> Bool {
        for (lhs, rhs) in [(occurredOrder, other.occurredOrder), (createdOrder, other.createdOrder)] {
            let comparison = MoneyTime.compare(lhs, rhs)
            if comparison != 0 { return comparison > 0 }
        }
        return id.uuidString.lowercased() > other.id.uuidString.lowercased()
    }
}

struct MoneyHistory: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let before: UUID?
    let next: UUID?
    let events: [MoneyEventSummary]

    func validated(member: VerifiedMember, cursor: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, before == cursor, events.count <= 50,
            Set(events.map(\.id)).count == events.count,
            events.allSatisfy({ $0.valid && $0.id != before }),
            next == nil || (events.count == 50 && next == events.last?.id)
        else { throw NestAPIFailure.contract }
        for pair in zip(events, events.dropFirst()) {
            guard pair.0.precedes(pair.1) else { throw NestAPIFailure.contract }
        }
        return self
    }
}

extension MoneyAPI {
    func history(token: String, member: VerifiedMember, before: UUID?) async throws -> MoneyHistory {
        let query = before.map { "?before=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/money/history\(query)", token: token, household: member.householdId, as: MoneyHistory.self)
        return try result.validated(member: member, cursor: before)
    }
}
