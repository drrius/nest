import Foundation

struct ExpenseInput: Codable, Equatable, Sendable {
    let description: String
    let amountCentimes: Centimes
    let receiptPath: String?
    let receiptTotalCentimes: Centimes?
    let payerId: UUID
    let allocations: [ExpenseAllocation]
    let date: CivilDate
    let note: String?
    let categoryId: UUID?

    func validated(member: VerifiedMember) throws -> Self {
        guard !description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            description.unicodeScalars.count <= 200, !description.contains("\0"),
            (note?.unicodeScalars.count ?? 0) <= 4000, !(note?.contains("\0") ?? false),
            amountCentimes.value >= 0, (receiptTotalCentimes?.value ?? amountCentimes.value) >= amountCentimes.value,
            allocations.contains(where: { $0.memberId == member.userId }),
            allocations.contains(where: { $0.memberId == payerId })
        else { throw NestAPIFailure.invalid }
        _ = try ExpenseSplit.exact(amountCentimes, members: allocations.map(\.memberId), shares: allocations)
        if let receiptPath {
            let prefix = member.householdId.uuidString.lowercased() + "/receipts/"
            guard receiptPath.hasPrefix(prefix),
                receiptPath.range(
                    of:
                        #"\A[0-9a-f-]{36}/receipts/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)\z"#,
                    options: .regularExpression) != nil
            else { throw NestAPIFailure.invalid }
        }
        return self
    }

    enum CodingKeys: String, CodingKey {
        case description, amountCentimes, receiptPath, receiptTotalCentimes, payerId, allocations, date, note,
            categoryId
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(description, forKey: .description)
        try container.encode(amountCentimes, forKey: .amountCentimes)
        try container.encodeIfPresent(receiptPath, forKey: .receiptPath)
        try container.encodeIfPresent(receiptTotalCentimes, forKey: .receiptTotalCentimes)
        try container.encode(payerId, forKey: .payerId)
        try container.encode(allocations, forKey: .allocations)
        try container.encode(date, forKey: .date)
        try container.encode(note, forKey: .note)
        try container.encode(categoryId, forKey: .categoryId)
    }
}

struct SaveExpense: Codable, Equatable, Sendable {
    let operationId: UUID
    let expense: ExpenseInput
}

struct ExpenseReceipt: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let eventId: UUID
    let approvalId: UUID?
    let expense: ExpenseInput

    func validated(member: VerifiedMember, command: SaveExpense) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, approvalId == nil, expense == command.expense
        else { throw NestAPIFailure.contract }
        _ = try expense.validated(member: member)
        return self
    }
}

struct ExpenseRecovery: Codable, Sendable {
    enum Status: String, Codable { case unresolved, recorded, cancelled }
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let status: Status
    let receipt: ExpenseReceipt?

    func validated(member: VerifiedMember, command: SaveExpense, cancellation: Bool = false) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, (status == .recorded) == (receipt != nil),
            !cancellation || status != .unresolved
        else { throw NestAPIFailure.contract }
        if let receipt { _ = try receipt.validated(member: member, command: command) }
        return self
    }
}
