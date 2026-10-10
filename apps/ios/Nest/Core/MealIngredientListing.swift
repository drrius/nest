import Foundation

public struct MealIngredientListing: Sendable {
    public let week: MealWeekStart
    public let revision: String
    public let household: UUID
    public private(set) var ingredients: [MealIngredient] = []
    public private(set) var skipped: [SkippedMealIngredients] = []
    public private(set) var nextAfter: MealIngredientSource?
    public private(set) var complete = false
    private var pages = 0
    private var meals: [UUID: MealIngredient] = [:]
    private var groceryIds: Set<UUID> = []

    init(week: MealWeekStart, revision: String, household: UUID) {
        self.week = week
        self.revision = revision
        self.household = household
    }

    func appending(_ page: MealIngredientPage) throws -> Self {
        guard !complete, pages < 42 else { throw MealLibraryError.invalidResponse }
        _ = try page.validated(household: household, week: week, revision: revision, after: nextAfter)
        guard pages == 0 || skipped == page.skipped else { throw MealLibraryError.invalidResponse }
        var result = self
        for row in page.ingredients { try result.accept(row) }
        result.ingredients += page.ingredients
        result.skipped = page.skipped
        result.nextAfter = page.nextAfter
        result.complete = page.nextAfter == nil
        result.pages += 1
        guard result.pages < 42 || result.complete else { throw MealLibraryError.invalidResponse }
        return result
    }
    private mutating func accept(_ row: MealIngredient) throws {
        if let prior = meals[row.entryId] {
            guard prior.mealTitle == row.mealTitle, prior.date == row.date, prior.slot == row.slot
            else { throw MealLibraryError.invalidResponse }
        }
        if let grocery = row.groceryItemId {
            guard groceryIds.insert(grocery).inserted else { throw MealLibraryError.invalidResponse }
        }
        meals[row.entryId] = row
    }

}

extension MealAPI {
    public func allIngredients(
        token: String, member: VerifiedMember, week: MealWeekStart, revision: String
    ) async throws -> MealIngredientListing {
        var listing = MealIngredientListing(week: week, revision: revision, household: member.householdId)
        while !listing.complete {
            try Task.checkCancellation()
            let page = try await ingredients(
                token: token, member: member, week: week, revision: revision, after: listing.nextAfter)
            listing = try listing.appending(page)
        }
        return listing
    }
}
