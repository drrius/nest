import Foundation

extension MealAPI {
    public func preparation(token: String, member: VerifiedMember, entry: UUID, week: MealWeekStart, revision: String)
        async throws -> MealPreparationEnvelope
    {
        guard MealRevision.valid(revision) else { throw MealContractError.invalidPlacement }
        let path =
            "v1/meals/preparation?entryId=\(entry.uuidString.lowercased())&weekStart=\(week.date.value)&revision=\(revision)"
        let result = try await http.read(
            path, token: token, household: member.householdId, as: MealPreparationEnvelope.self)
        return try result.validated(household: member.householdId, week: week, id: entry, revision: revision)
    }

    public func createPreparation(token: String, member: VerifiedMember, command: CreateMealPreparation) async throws
        -> MealPreparationReceipt
    {
        let result = try await http.write(
            "v1/meals/preparation/create", token: token, household: member.householdId, body: command.validated(),
            as: MealPreparationWriteEnvelope.self)
        guard result.version == 1 else { throw MealContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }

    public func editPreparation(token: String, member: VerifiedMember, command: EditMealPreparation) async throws
        -> MealPreparationReceipt
    {
        let result = try await http.write(
            "v1/meals/preparation/edit", token: token, household: member.householdId, body: command.validated(),
            as: MealPreparationWriteEnvelope.self)
        guard result.version == 1 else { throw MealContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }
}
