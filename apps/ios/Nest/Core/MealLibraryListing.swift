import Foundation

struct MealLibraryListing: Codable, Equatable, Sendable {
    let householdId: UUID
    let revision: String
    let meals: [SavedMealSummary]
    let nextAfterId: UUID?

    init(page: MealLibraryPage) {
        householdId = page.householdId
        revision = page.revision
        meals = page.meals
        nextAfterId = page.nextAfterId
    }

    func appending(_ page: MealLibraryPage) throws -> Self {
        guard page.householdId == householdId, page.revision == revision, let nextAfterId,
            page.meals.first.map({ $0.id.uuidString.lowercased() > nextAfterId.uuidString.lowercased() }) ?? true
        else { throw MealLibraryError.invalidResponse }
        _ = try page.validated(household: householdId, after: nextAfterId, revision: revision)
        return try Self(
            householdId: householdId, revision: revision, meals: meals + page.meals, nextAfterId: page.nextAfterId
        ).validated()
    }

    func validated() throws -> Self {
        guard MealRevision.valid(revision),
            nextAfterId == nil || (meals.count >= 50 && meals.count.isMultiple(of: 50) && nextAfterId == meals.last?.id)
        else { throw MealLibraryError.invalidResponse }
        for (index, meal) in meals.enumerated() {
            _ = try meal.validated()
            if index > 0, meal.id.uuidString.lowercased() <= meals[index - 1].id.uuidString.lowercased() {
                throw MealLibraryError.invalidResponse
            }
        }
        return self
    }

    func retainingVisitedPages(afterRefreshing first: Self) throws -> Self {
        guard householdId == first.householdId, revision == first.revision, first.nextAfterId != nil,
            meals.count >= first.meals.count, Array(meals.prefix(first.meals.count)) == first.meals
        else { return first }
        return try validated()
    }

    private init(householdId: UUID, revision: String, meals: [SavedMealSummary], nextAfterId: UUID?) {
        self.householdId = householdId
        self.revision = revision
        self.meals = meals
        self.nextAfterId = nextAfterId
    }
}
