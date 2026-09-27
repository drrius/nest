import Foundation

extension SessionModel {
    func clearMealPresentation() {
        mealSelection = nil
        mealStatus = .idle
        mealNotice = nil
        mealPlacement = nil
        mealPlacementSaving = false
        mealVisibleSlots = MealSlot.allCases
        mealSlotNotice = nil
        mealRemoval = nil
        mealRemovalSaving = false
        mealLibrary = .idle
        mealLibraryNotice = nil
        savedRecipe = .idle
        savedRecipeRevision = nil
        mealRecipePlacement = nil
        mealRecipePlacementSaving = false
        mealLoadingRequest = nil
        mealPlacementSavingGeneration = nil
        mealRemovalSavingGeneration = nil
        mealLibraryRequest = nil
        savedRecipeRequest = nil
        mealRecipePlacementSavingGeneration = nil
        plannedRecipe = .idle
        plannedRecipeNotice = nil
        plannedRecipeTarget = nil
        plannedRecipeFresh = false
        plannedRecipeRequest = nil
    }
}
