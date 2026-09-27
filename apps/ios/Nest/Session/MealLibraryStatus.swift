import Foundation

struct MealLibraryListing: Equatable {
    let revision: String
    let meals: [SavedMealSummary]
    let nextAfterId: UUID?

    init(page: MealLibraryPage) {
        revision = page.revision
        meals = page.meals
        nextAfterId = page.nextAfterId
    }

    func appending(_ page: MealLibraryPage) throws -> Self {
        guard page.revision == revision, let nextAfterId,
            page.meals.first.map({ $0.id.uuidString.lowercased() > nextAfterId.uuidString.lowercased() }) ?? true
        else { throw MealLibraryError.invalidResponse }
        return Self(revision: revision, meals: meals + page.meals, nextAfterId: page.nextAfterId)
    }

    private init(revision: String, meals: [SavedMealSummary], nextAfterId: UUID?) {
        self.revision = revision
        self.meals = meals
        self.nextAfterId = nextAfterId
    }
}

enum MealLibraryStatus: Equatable {
    case idle, loading
    case loaded(MealLibraryListing)
    case failed
}

enum SavedRecipeStatus: Equatable {
    case idle, loading
    case loaded(SavedRecipe)
    case missing, failed
}
