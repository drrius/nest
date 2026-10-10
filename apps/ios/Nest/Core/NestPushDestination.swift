import Foundation

/// Untrusted routing identity only. The destination screen must read its target through an authorized API.
struct NestPushDestination: Decodable, Equatable, Identifiable, Sendable {
    enum Kind: String, Codable, Sendable {
        case renewal, chore, meal, grocery, recurring
        case dailySummary = "daily_summary"

        var targetKey: String {
            switch self {
            case .renewal: "renewalId"
            case .chore: "occurrenceId"
            case .meal: "entryId"
            case .grocery: "itemId"
            case .recurring: "ruleId"
            case .dailySummary: "summaryId"
            }
        }
    }

    let kind: Kind
    let householdId: UUID
    let targetId: UUID
    let recipientId: UUID?
    var id: String { "\(kind.rawValue)/\(householdId)/\(targetId)/\(recipientId?.uuidString ?? "")" }

    init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: WireKey.self)
        guard try values.decode(Int.self, forKey: .key("version")) == 1 else { throw NestAPIFailure.contract }
        kind = try values.decode(Kind.self, forKey: .key("kind"))
        var keys: Set<String> = ["version", "kind", "householdId", kind.targetKey]
        if kind == .dailySummary { keys.insert("recipientId") }
        guard Set(values.allKeys.map(\.stringValue)) == keys else { throw NestAPIFailure.contract }
        householdId = try values.decode(UUID.self, forKey: .key("householdId"))
        targetId = try values.decode(UUID.self, forKey: .key(kind.targetKey))
        recipientId = kind == .dailySummary ? try values.decode(UUID.self, forKey: .key("recipientId")) : nil
    }

    static func decode(_ data: Data) throws -> Self {
        guard !data.isEmpty, data.count <= 4096 else { throw NestAPIFailure.contract }
        do { return try JSONDecoder().decode(Self.self, from: data) } catch { throw NestAPIFailure.contract }
    }

    func validated(member: VerifiedMember) throws -> Self {
        guard householdId == member.householdId, kind != .dailySummary || recipientId == member.userId else {
            throw NestAPIFailure.forbidden
        }
        return self
    }

    private struct WireKey: CodingKey {
        let stringValue: String
        let intValue: Int? = nil
        init?(stringValue: String) { self.stringValue = stringValue }
        init?(intValue: Int) { return nil }
        static func key(_ value: String) -> Self { Self(stringValue: value)! }
    }
}
