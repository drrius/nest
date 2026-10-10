import Foundation

struct RefundContext: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let source: MoneyDetail
    let remaining: [ExpenseAllocation]
    let refundable: Bool

    func validated(member: VerifiedMember, sourceEventId: UUID) throws -> Self {
        _ = try source.validated(member: member, eventId: sourceEventId)
        guard version == 1, householdId == member.householdId,
            [.expense, .replacement].contains(source.event.kind), remaining.count == 2,
            Set(remaining.map(\.memberId)).count == 2,
            remaining.allSatisfy({ share in
                guard let original = source.shares.first(where: { $0.memberId == share.memberId })?.allocatedCentimes
                else {
                    return false
                }
                return share.centimes.value >= 0 && share.centimes.value <= original.value
            }),
            refundable == (source.reversedById == nil && remaining.contains(where: { $0.centimes.value > 0 }))
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func refundContext(token: String, member: VerifiedMember, sourceEventId: UUID) async throws -> RefundContext {
        let context = try await http.read(
            "v1/money/refund/context?sourceEventId=\(sourceEventId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RefundContext.self)
        return try context.validated(member: member, sourceEventId: sourceEventId)
    }
}
