import Foundation

extension MealAPI {
    public func replaceWithRecipe(
        token: String, member: VerifiedMember, week: MealWeekSnapshot,
        meal: PlannedMeal, recipe: SavedRecipe, command: ReplaceSavedRecipe
    ) async throws -> MealRecipeReplacementReceipt {
        _ = try week.validated(household: member.householdId, week: week.weekStart)
        _ = try command.validated(week: week, meal: meal, recipe: recipe)
        let response = try await http.write(
            "v1/meals/recipe/replace", token: token,
            household: member.householdId, body: command, as: MealRecipeReplacementEnvelope.self)
        guard response.version == 1 else { throw MealContractError.invalidReceipt }
        return try response.receipt.validated(member: member, command: command)
    }
}
