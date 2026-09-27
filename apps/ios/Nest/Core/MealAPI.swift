import Foundation

public struct MealAPI: Sendable {
    private let http: NestHTTP

    public init(http: NestHTTP) { self.http = http }

    public func verify(token: String, expectedActor: UUID) async throws -> VerifiedMember {
        let response = try await http.read("v1/session", token: token, as: VerifiedSession.self)
        return try response.validated(actor: expectedActor)
    }

    public func week(
        token: String, member: VerifiedMember, start: MealWeekStart
    ) async throws -> MealWeekSnapshot {
        let path = "v1/meals/week?weekStart=\(start.date.value)"
        let result = try await http.read(
            path, token: token, household: member.householdId, as: MealWeekSnapshot.self)
        return try result.validated(household: member.householdId, week: start)
    }

    public func visibleSlots(token: String, member: VerifiedMember) async throws -> [MealSlot] {
        let result = try await http.read(
            "v1/cooking-preferences", token: token, household: member.householdId,
            as: CookingSlotsEnvelope.self)
        return try result.validated(household: member.householdId)
    }

    public func library(
        token: String, member: VerifiedMember, after: UUID? = nil,
        revision: String? = nil
    ) async throws -> MealLibraryPage {
        guard after == nil || revision != nil else { throw MealLibraryError.invalidResponse }
        var parts: [String] = []
        if let after { parts.append("afterId=\(after.uuidString.lowercased())") }
        if let revision {
            guard MealRevision.valid(revision) else { throw MealLibraryError.invalidResponse }
            parts.append("expectedRevision=\(revision)")
        }
        let query = parts.isEmpty ? "" : "?\(parts.joined(separator: "&"))"
        let page = try await http.read(
            "v1/meals/library\(query)", token: token,
            household: member.householdId, as: MealLibraryPage.self)
        return try page.validated(household: member.householdId, after: after, revision: revision)
    }

    public func recipe(
        token: String, member: VerifiedMember, id: UUID, revision: String
    ) async throws -> SavedRecipe? {
        guard MealRevision.valid(revision) else { throw MealLibraryError.invalidResponse }
        let path = "v1/meals/recipe?definitionId=\(id.uuidString.lowercased())&expectedRevision=\(revision)"
        let response = try await http.read(
            path, token: token, household: member.householdId,
            as: SavedRecipeEnvelope.self)
        return try response.validated(
            household: member.householdId, definition: id, revision: revision)
    }

    public func plannedRecipe(
        token: String, member: VerifiedMember, week: MealWeekSnapshot, id: UUID
    ) async throws -> PlannedRecipeEnvelope {
        _ = try week.validated(household: member.householdId, week: week.weekStart)
        let path =
            "v1/meals/planned-recipe?entryId=\(id.uuidString.lowercased())&weekStart=\(week.weekStart.date.value)&revision=\(week.revision)"
        let result = try await http.read(
            path, token: token, household: member.householdId,
            as: PlannedRecipeEnvelope.self)
        return try result.validated(against: week, id: id)
    }

    public func place(
        token: String, member: VerifiedMember, week: MealWeekSnapshot, command: PlaceMeal
    ) async throws -> MealPlacementReceipt {
        _ = try command.validated(against: week)
        let result = try await http.write(
            "v1/meals/place", token: token, household: member.householdId,
            body: command, as: MealPlacementEnvelope.self)
        return try result.validated(member: member, command: command)
    }

    public func placeRecipe(
        token: String, member: VerifiedMember, week: MealWeekSnapshot,
        recipe: SavedRecipe, command: PlaceSavedRecipe
    ) async throws -> MealRecipePlacementReceipt {
        _ = try command.validated(against: week, recipe: recipe)
        let result = try await http.write(
            "v1/meals/recipe/place", token: token, household: member.householdId,
            body: command, as: MealRecipePlacementEnvelope.self)
        return try result.validated(member: member, command: command)
    }

    func move(token: String, member: VerifiedMember, saved: SavedMealMove) async throws -> MealMoveReceipt {
        _ = try saved.source.validated(household: member.householdId, week: saved.source.weekStart)
        _ = try saved.command.validated(source: saved.source, target: saved.target, meal: saved.meal)
        let result = try await http.write(
            "v1/meals/move", token: token, household: member.householdId,
            body: saved.command, as: MealMoveEnvelope.self)
        guard result.version == 1 else { throw MealContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: saved.command)
    }

    public func remove(
        token: String, member: VerifiedMember, week: MealWeekSnapshot,
        meal: PlannedMeal, command: RemoveMeal
    ) async throws -> MealRemovalReceipt {
        _ = try command.validated(against: week, meal: meal)
        let result = try await http.write(
            "v1/meals/remove", token: token, household: member.householdId,
            body: command, as: MealRemovalEnvelope.self)
        return try result.validated(member: member, command: command)
    }
}
