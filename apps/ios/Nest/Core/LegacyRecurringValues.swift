import Foundation

/// Retained values stay exact, including unsupported dates and microsecond versions.
struct LegacyTemporalValue: Codable, Equatable, Sendable {
    enum Kind: String, Codable { case date, timestamp, unsupported }
    enum Reason: String, Codable {
        case nonFinite = "non_finite"
        case outOfRange = "out_of_range"
    }
    let kind: Kind
    let value: String
    let reason: Reason?

    func valid(expected: Kind) -> Bool {
        if kind == .unsupported { return reason != nil && !value.isEmpty && value.utf16.count <= 80 }
        guard kind == expected, reason == nil else { return false }
        return kind == .date ? (try? CivilDate(value)) != nil : MoneyTime.timestamp(value)
    }

    var display: String { kind == .unsupported ? "Needs review · \(value)" : value }
}

struct LegacyRecurringSplit: Codable, Equatable, Sendable {
    enum Kind: String, Codable {
        case valid
        case needsReview = "needs_review"
    }
    let kind: Kind
    let shares: [ExpenseAllocation]?
    let reason: String?

    func valid(amount: Centimes?, payer: UUID?) -> Bool {
        if kind == .needsReview { return reason == "invalid_split" && shares == nil }
        guard reason == nil, let amount, let payer, let shares, shares.count == 2,
            shares[0].memberId != shares[1].memberId, shares.contains(where: { $0.memberId == payer }),
            shares.allSatisfy({ $0.centimes.value >= 0 })
        else { return false }
        return shares[0].centimes.value + shares[1].centimes.value == amount.value
    }
}

struct LegacyDraftCounts: Codable, Equatable, Sendable {
    let pending: String
    let posted: String
    let dismissed: String
    let postedWithoutEvent: String
    let unpostedWithEvent: String
    let unsupportedDates: String
    let latestDraftOn: LegacyTemporalValue?

    enum CodingKeys: String, CodingKey {
        case pending, posted, dismissed, postedWithoutEvent, unpostedWithEvent, unsupportedDates, latestDraftOn
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(pending, forKey: .pending)
        try values.encode(posted, forKey: .posted)
        try values.encode(dismissed, forKey: .dismissed)
        try values.encode(postedWithoutEvent, forKey: .postedWithoutEvent)
        try values.encode(unpostedWithEvent, forKey: .unpostedWithEvent)
        try values.encode(unsupportedDates, forKey: .unsupportedDates)
        try values.encode(latestDraftOn, forKey: .latestDraftOn)
    }

    var valid: Bool {
        let texts = [pending, posted, dismissed, postedWithoutEvent, unpostedWithEvent, unsupportedDates]
        let counts = texts.compactMap(Self.count)
        guard counts.count == 6, counts[3] <= counts[1],
            Self.atMostSum(counts[4], [counts[0], counts[2]]),
            Self.atMostSum(counts[5], Array(counts.prefix(3))),
            (counts.prefix(3).allSatisfy({ $0 == 0 })) == (latestDraftOn == nil)
        else { return false }
        return latestDraftOn?.valid(expected: .date) ?? true
    }

    var needsReconciliation: Bool { postedWithoutEvent != "0" || unpostedWithEvent != "0" || unsupportedDates != "0" }

    static func count(_ text: String) -> UInt64? {
        guard text.count <= 19, let value = UInt64(text), String(value) == text else { return nil }
        return value
    }

    // A sum beyond UInt64.max is greater than every allowed individual count.
    static func atMostSum(_ count: UInt64, _ parts: [UInt64]) -> Bool {
        var total: UInt64 = 0
        for part in parts {
            let sum = total.addingReportingOverflow(part)
            if sum.overflow { return true }
            total = sum.partialValue
        }
        return count <= total
    }
}

enum LegacyRecurringLabel {
    static func valid(_ text: String) -> Bool {
        let length = text.trimmingCharacters(in: CharacterSet(charactersIn: " ")).unicodeScalars.count
        return !text.contains("\0") && (1...200).contains(length)
    }
    static func display(_ text: String) -> String {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Retained recurring expense" : text
    }
}
