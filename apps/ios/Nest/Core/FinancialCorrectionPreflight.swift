import Foundation

extension RefundInput {
    func validated(member: VerifiedMember, context: RefundContext) throws -> Self {
        _ = try validated(member: member)
        _ = try context.validated(member: member, sourceEventId: sourceEventId)
        let expected = Dictionary(uniqueKeysWithValues: expectedRemaining.map { ($0.memberId, $0.centimes) })
        let current = Dictionary(uniqueKeysWithValues: context.remaining.map { ($0.memberId, $0.centimes) })
        guard context.refundable, expected == current else { throw NestAPIFailure.conflict }
        return self
    }
}

extension CorrectionInput {
    func validated(member: VerifiedMember, context: CorrectionContext) throws -> Self {
        _ = try validated(member: member)
        _ = try context.validated(member: member, sourceEventId: sourceEventId)
        switch replacement {
        case .expense(let expense):
            guard context.canReplace, [.expense, .replacement].contains(context.source.event.kind),
                Set(expense.allocations.map(\.memberId)) == Set(context.source.shares.map(\.memberId))
            else { throw NestAPIFailure.conflict }
        case .opening(let opening):
            guard context.canReplace, context.source.event.kind == .openingBalance,
                context.source.reversedById == expectedReversalId,
                context.source.shares.contains(where: { $0.memberId == opening.payerId })
            else { throw NestAPIFailure.conflict }
        case nil:
            guard context.canReverse else { throw NestAPIFailure.conflict }
        }
        return self
    }
}
