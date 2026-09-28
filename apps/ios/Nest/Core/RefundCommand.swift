import Foundation

struct RefundInput: Codable, Equatable, Sendable {
    let sourceEventId: UUID
    let description: String
    let amountCentimes: Centimes
    let payerId: UUID
    let allocations: [ExpenseAllocation]
    let expectedRemaining: [ExpenseAllocation]
    let date: CivilDate
    let note: String?

    func validated(member: VerifiedMember) throws -> Self {
        guard !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            description.unicodeScalars.count <= 200, !description.contains("\0"),
            (note?.unicodeScalars.count ?? 0) <= 4000, !(note?.contains("\0") ?? false),
            amountCentimes.value > 0, expectedRemaining.count == 2,
            Set(expectedRemaining.map(\.memberId)).count == 2,
            expectedRemaining.contains(where: { $0.memberId == payerId }),
            expectedRemaining.contains(where: { $0.memberId == member.userId }),
            expectedRemaining.allSatisfy({ $0.centimes.value >= 0 }),
            expectedRemaining.reduce(Int64(0), { $0 + $1.centimes.value }) <= 9_007_199_254_740_991
        else { throw NestAPIFailure.invalid }
        _ = try ExpenseSplit.exact(amountCentimes, members: expectedRemaining.map(\.memberId), shares: allocations)
        guard
            allocations.allSatisfy({ share in
                guard let cap = expectedRemaining.first(where: { $0.memberId == share.memberId }) else { return false }
                return share.centimes.value <= cap.centimes.value
            })
        else { throw NestAPIFailure.invalid }
        return self
    }

    enum CodingKeys: String, CodingKey {
        case sourceEventId, description, amountCentimes, payerId, allocations, expectedRemaining, date, note
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(sourceEventId, forKey: .sourceEventId)
        try values.encode(description, forKey: .description)
        try values.encode(amountCentimes, forKey: .amountCentimes)
        try values.encode(payerId, forKey: .payerId)
        try values.encode(allocations, forKey: .allocations)
        try values.encode(expectedRemaining, forKey: .expectedRemaining)
        try values.encode(date, forKey: .date)
        try values.encode(note, forKey: .note)
    }
}

struct SaveRefund: Codable, Equatable, Sendable {
    let operationId: UUID
    let refund: RefundInput
}

struct RefundReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let eventId: UUID
    let approvalId: UUID?
    let refund: RefundInput

    func validated(member: VerifiedMember, command: SaveRefund) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, eventId != refund.sourceEventId,
            refund == command.refund
        else { throw NestAPIFailure.contract }
        _ = try refund.validated(member: member)
        return self
    }
}
