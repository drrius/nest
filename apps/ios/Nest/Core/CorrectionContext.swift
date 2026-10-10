import Foundation

struct CorrectionContext: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let source: MoneyDetail
    let hasActiveRefunds: Bool
    let hasOpeningSuccessor: Bool
    let canReverse: Bool
    let canReplace: Bool

    func validated(member: VerifiedMember, sourceEventId: UUID) throws -> Self {
        _ = try source.validated(member: member, eventId: sourceEventId)
        let expense = [.expense, .replacement].contains(source.event.kind)
        let opening = source.event.kind == .openingBalance
        let clear = !hasActiveRefunds && !hasOpeningSuccessor
        let unreversed = source.reversedById == nil
        guard version == 1, householdId == member.householdId,
            !hasActiveRefunds || expense, !hasOpeningSuccessor || opening,
            canReverse == (source.event.kind != .reversal && unreversed && clear),
            canReplace == (clear && ((expense && unreversed) || opening))
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func correctionContext(token: String, member: VerifiedMember, sourceEventId: UUID) async throws
        -> CorrectionContext
    {
        let context = try await http.read(
            "v1/money/correction/context?sourceEventId=\(sourceEventId.uuidString.lowercased())",
            token: token, household: member.householdId, as: CorrectionContext.self)
        return try context.validated(member: member, sourceEventId: sourceEventId)
    }
}
