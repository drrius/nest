import Foundation

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
