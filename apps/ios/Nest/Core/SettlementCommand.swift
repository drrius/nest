import Foundation

struct SettlementInput: Codable, Equatable, Sendable {
    enum Mode: String, Codable { case full, partial }
    let description: String
    let amountCentimes: Centimes
    let expectedOutstandingCentimes: Centimes
    let payerId: UUID
    let recipientId: UUID
    let mode: Mode
    let date: CivilDate
    let note: String?

    func validated(member: VerifiedMember) throws -> Self {
        guard !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            description.unicodeScalars.count <= 200, !description.contains("\0"),
            (note?.unicodeScalars.count ?? 0) <= 4000, !(note?.contains("\0") ?? false),
            payerId != recipientId, [payerId, recipientId].contains(member.userId),
            amountCentimes.value > 0, expectedOutstandingCentimes.value > 0,
            amountCentimes.value <= expectedOutstandingCentimes.value,
            mode != .full || amountCentimes == expectedOutstandingCentimes
        else { throw NestAPIFailure.invalid }
        return self
    }

    enum CodingKeys: String, CodingKey {
        case description, amountCentimes, expectedOutstandingCentimes, payerId, recipientId, mode, date, note
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(description, forKey: .description)
        try values.encode(amountCentimes, forKey: .amountCentimes)
        try values.encode(expectedOutstandingCentimes, forKey: .expectedOutstandingCentimes)
        try values.encode(payerId, forKey: .payerId)
        try values.encode(recipientId, forKey: .recipientId)
        try values.encode(mode, forKey: .mode)
        try values.encode(date, forKey: .date)
        try values.encode(note, forKey: .note)
    }
}

struct SaveSettlement: Codable, Equatable, Sendable {
    let operationId: UUID
    let settlement: SettlementInput
}

struct SettlementReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let eventId: UUID
    let approvalId: UUID?
    let settlement: SettlementInput

    func validated(member: VerifiedMember, command: SaveSettlement) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, settlement == command.settlement
        else { throw NestAPIFailure.contract }
        _ = try settlement.validated(member: member)
        return self
    }
}

struct SettlementDraft {
    var mode = SettlementInput.Mode.full
    var amount = ""
    var note = ""

    func reviewed(balance: MoneyBalance, member: VerifiedMember, date: CivilDate) throws -> SettlementInput {
        _ = try balance.validated(member: member)
        guard let payer = balance.members.first(where: { $0.centimes.value < 0 }),
            let recipient = balance.members.first(where: { $0.centimes.value > 0 })
        else { throw NestAPIFailure.invalid }
        let outstanding = recipient.centimes
        let trimmed = note.trimmingCharacters(in: .whitespacesAndNewlines)
        return try SettlementInput(
            description: "Settlement", amountCentimes: mode == .full ? outstanding : ExpenseSplit.parseCHF(amount),
            expectedOutstandingCentimes: outstanding, payerId: payer.id, recipientId: recipient.id, mode: mode,
            date: date, note: trimmed.isEmpty ? nil : trimmed
        ).validated(member: member)
    }
}
