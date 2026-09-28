import Foundation

/// Exact CHF centimes. The wire range matches the shared financial contract.
struct Centimes: Codable, Equatable, Sendable {
    let value: Int64

    init(_ text: String) throws {
        guard let amount = Int64(text), String(amount) == text,
            (-9_007_199_254_740_991...9_007_199_254_740_991).contains(amount)
        else { throw NestAPIFailure.contract }
        value = amount
    }

    init(from decoder: Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(String(value))
    }

    var absoluteCHF: String {
        let amount = abs(value)
        return "CHF \(amount / 100).\(String(format: "%02lld", amount % 100))"
    }
}

struct MoneyBalance: Codable, Sendable {
    struct Member: Codable, Identifiable, Sendable {
        let actorId: UUID
        let displayName: String
        let centimes: Centimes
        var id: UUID { actorId }
    }
    let version: Int
    let householdId: UUID
    let eventCount: String
    let openingEstablished: Bool
    let members: [Member]

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, householdId == member.householdId,
            members.count == 2, members[0].actorId != members[1].actorId,
            members.contains(where: { $0.actorId == member.userId }),
            members.allSatisfy({ !$0.displayName.isEmpty }),
            members[0].centimes.value + members[1].centimes.value == 0,
            eventCount.count <= 19, let count = UInt64(eventCount), String(count) == eventCount,
            count > 0 || (!openingEstablished && members.allSatisfy({ $0.centimes.value == 0 }))
        else { throw NestAPIFailure.contract }
        return self
    }
}

struct MoneyAPI: Sendable {
    let http: NestHTTP

    func balance(token: String, member: VerifiedMember) async throws -> MoneyBalance {
        let result = try await http.read(
            "v1/money/balance", token: token, household: member.householdId, as: MoneyBalance.self)
        return try result.validated(member: member)
    }
}
