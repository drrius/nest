import Foundation

extension EditRecipe {
    func validated(against baseline: SavedRecipe) throws -> Self {
        _ = try validated()
        _ = try baseline.validated()
        guard definitionId == baseline.id else { throw MealContractError.invalidPlacement }
        for selection in ingredients ?? [] {
            if case .existing(let id, _) = selection, !baseline.ingredients.contains(where: { $0.id == id }) {
                throw MealContractError.invalidPlacement
            }
        }
        return self
    }

    func matches(_ recipe: SavedRecipe, baseline: SavedRecipe) -> Bool {
        guard recipe.id == definitionId,
            recipe.title == (patch.title ?? baseline.title),
            recipe.servings == (patch.servings ?? baseline.servings),
            recipe.instructions == (patch.instructions ?? baseline.instructions),
            recipe.recipeUrl == (patch.recipeUrl ?? baseline.recipeUrl),
            recipe.notes == (patch.notes ?? baseline.notes)
        else { return false }
        guard let ingredients else { return recipe.ingredients == baseline.ingredients }
        guard ingredients.count == recipe.ingredients.count else { return false }
        return zip(ingredients, recipe.ingredients).allSatisfy { selection, actual in
            ingredientMatches(selection, actual: actual, baseline: baseline)
        }
    }

    private func ingredientMatches(
        _ selection: RecipeIngredientSelection, actual: SavedIngredient,
        baseline: SavedRecipe
    ) -> Bool {
        switch selection {
        case .new(let draft):
            guard !baseline.ingredients.contains(where: { $0.id == actual.id }) else { return false }
            return ingredientContentMatches(actual, draft: draft)
        case .existing(let id, let patch):
            guard let original = baseline.ingredients.first(where: { $0.id == id }), actual.id == id else {
                return false
            }
            let expected = RecipeIngredientDraft(
                name: patch.name ?? original.name,
                quantity: patch.quantity ?? original.quantity, unit: patch.unit ?? original.unit,
                categoryId: patch.categoryId ?? original.categoryId, note: patch.note ?? original.note)
            return ingredientContentMatches(actual, draft: expected)
        }
    }

    private func ingredientContentMatches(_ actual: SavedIngredient, draft: RecipeIngredientDraft) -> Bool {
        actual.name == draft.name && actual.quantity == draft.quantity && actual.unit == draft.unit
            && actual.categoryId == draft.categoryId && actual.note == draft.note
    }
}
