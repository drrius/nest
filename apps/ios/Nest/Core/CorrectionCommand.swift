import Foundation

struct OpeningReplacement: Codable, Equatable, Sendable {
    let description: String
    let amountCentimes: Centimes
    let payerId: UUID
    let date: CivilDate
    let note: String?

    func validated() throws {
        guard !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            description.unicodeScalars.count <= 200, !description.contains("\0"), amountCentimes.value >= 0,
            (note?.unicodeScalars.count ?? 0) <= 4000, !(note?.contains("\0") ?? false)
        else { throw NestAPIFailure.invalid }
    }

    enum CodingKeys: String, CodingKey { case description, amountCentimes, payerId, date, note }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(description, forKey: .description)
        try values.encode(amountCentimes, forKey: .amountCentimes)
        try values.encode(payerId, forKey: .payerId)
        try values.encode(date, forKey: .date)
        try values.encode(note, forKey: .note)
    }
}

enum CorrectionReplacement: Codable, Equatable, Sendable {
    case expense(ExpenseInput)
    case opening(OpeningReplacement)
    enum CodingKeys: String, CodingKey { case kind, expense, opening }
    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        switch try values.decode(String.self, forKey: .kind) {
        case "expense": self = .expense(try values.decode(ExpenseInput.self, forKey: .expense))
        case "opening_balance": self = .opening(try values.decode(OpeningReplacement.self, forKey: .opening))
        default: throw NestAPIFailure.contract
        }
    }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .expense(let input):
            try values.encode("expense", forKey: .kind)
            try values.encode(input, forKey: .expense)
        case .opening(let input):
            try values.encode("opening_balance", forKey: .kind)
            try values.encode(input, forKey: .opening)
        }
    }
}

struct CorrectionInput: Codable, Equatable, Sendable {
    let sourceEventId: UUID
    let expectedReversalId: UUID?
    let replacement: CorrectionReplacement?

    func validated(member: VerifiedMember) throws -> Self {
        guard sourceEventId != expectedReversalId else { throw NestAPIFailure.invalid }
        switch replacement {
        case .expense(let expense):
            _ = try expense.validated(member: member)
            guard expense.receiptPath == nil, expectedReversalId == nil else { throw NestAPIFailure.invalid }
        case .opening(let opening): try opening.validated()
        case nil:
            guard expectedReversalId == nil else { throw NestAPIFailure.invalid }
        }
        return self
    }

    enum CodingKeys: String, CodingKey { case sourceEventId, expectedReversalId, replacement }
    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(sourceEventId, forKey: .sourceEventId)
        try values.encode(expectedReversalId, forKey: .expectedReversalId)
        try values.encode(replacement, forKey: .replacement)
    }
}

struct SaveCorrection: Codable, Equatable, Sendable {
    let operationId: UUID
    let correction: CorrectionInput
}

struct CorrectionReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let approvalId: UUID?
    let reversalEventId: UUID
    let replacementEventId: UUID?
    let correction: CorrectionInput

    func validated(member: VerifiedMember, command: SaveCorrection) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, correction == command.correction,
            reversalEventId != correction.sourceEventId, replacementEventId != correction.sourceEventId,
            replacementEventId != reversalEventId,
            (replacementEventId == nil) == (correction.replacement == nil),
            correction.expectedReversalId == nil || correction.expectedReversalId == reversalEventId
        else { throw NestAPIFailure.contract }
        _ = try correction.validated(member: member)
        return self
    }
}
