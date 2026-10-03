import Foundation

extension MoneyAPI {
    func legacyAdoptionContext(token: String, member: VerifiedMember, ruleId: UUID) async throws
        -> LegacyAdoptionContext
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-adoption/context?ruleId=\(ruleId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyAdoptionContext.self)
        return try result.validated(member: member, ruleId: ruleId)
    }

    func saveLegacyAdoption(token: String, member: VerifiedMember, command: SaveLegacyAdoption) async throws
        -> LegacyAdoptionReceipt
    {
        let result = try await http.write(
            "v1/money/recurring/legacy-adoption/save", token: token, household: member.householdId,
            body: command, as: LegacyAdoptionReceipt.self)
        return try result.validated(member: member, command: command)
    }

    func recoverLegacyAdoption(token: String, member: VerifiedMember, command: SaveLegacyAdoption) async throws
        -> LegacyAdoptionRecovery
    {
        let result = try await http.read(
            "v1/money/recurring/legacy-adoption/receipt?operationId=\(command.operationId.uuidString.lowercased())",
            token: token, household: member.householdId, as: LegacyAdoptionRecovery.self)
        return try result.validated(member: member, command: command)
    }

    func cancelLegacyAdoption(token: String, member: VerifiedMember, command: SaveLegacyAdoption) async throws
        -> LegacyAdoptionRecovery
    {
        struct Cancellation: Encodable { let operationId: UUID }
        let result = try await http.write(
            "v1/money/recurring/legacy-adoption/cancel-save", token: token, household: member.householdId,
            body: Cancellation(operationId: command.operationId), as: LegacyAdoptionRecovery.self)
        return try result.validated(member: member, command: command, cancellation: true)
    }
}
