import SwiftUI

struct RecipeContentView: View {
    let recipe: RecipeContent
    let context: String?

    init(recipe: RecipeContent, context: String? = nil) {
        self.recipe = recipe
        self.context = context
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            Text(recipe.title)
                .font(.largeTitle.weight(.semibold))
                .foregroundStyle(QuietPalette.ink)
            if let context {
                Text(context).font(.subheadline).foregroundStyle(QuietPalette.muted)
            }
            if let servings = recipe.servings {
                Text("Serves \(servings)").font(.subheadline).foregroundStyle(QuietPalette.muted)
            }
            if let notes = recipe.notes, !notes.isEmpty {
                Text(notes).foregroundStyle(QuietPalette.muted)
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("Ingredients").font(.title3.weight(.semibold)).foregroundStyle(QuietPalette.ink)
                if recipe.ingredients.isEmpty {
                    Text("No ingredients saved.").foregroundStyle(QuietPalette.muted)
                }
                ForEach(recipe.ingredients) { ingredient in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(ingredientLine(ingredient)).foregroundStyle(QuietPalette.ink)
                        if let note = ingredient.note, !note.isEmpty {
                            Text(note).font(.subheadline).foregroundStyle(QuietPalette.muted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            VStack(alignment: .leading, spacing: 12) {
                Text("How to make it").font(.title3.weight(.semibold)).foregroundStyle(QuietPalette.ink)
                if let instructions = recipe.instructions, !instructions.isEmpty {
                    Text(instructions).foregroundStyle(QuietPalette.ink)
                } else {
                    Text("No cooking instructions saved.").foregroundStyle(QuietPalette.muted)
                }
            }
            if let link = MealLibraryText.openableURL(recipe.recipeUrl) {
                Link("Open recipe link", destination: link).frame(minHeight: 52, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func ingredientLine(_ ingredient: SavedIngredient) -> String {
        [ingredient.quantity, ingredient.unit, ingredient.name]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }.joined(separator: " ")
    }
}
