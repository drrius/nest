import SwiftUI

struct SavedRecipeScreen: View {
    @ObservedObject var model: SessionModel
    let id: UUID

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Recipe")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: id) { await model.loadSavedRecipe(id) }
    }

    @ViewBuilder
    private var content: some View {
        switch model.savedRecipe {
        case .idle, .loading:
            ProgressView("Loading recipe…")
                .frame(maxWidth: .infinity, minHeight: 120)
        case .missing:
            Text("This meal is no longer in your saved library.")
                .foregroundStyle(QuietPalette.muted)
        case .failed:
            VStack(alignment: .leading, spacing: 12) {
                Text("Could not load this recipe. Refresh saved meals and try again.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Refresh and try again") {
                    Task {
                        await model.refreshMealLibrary()
                        await model.loadSavedRecipe(id)
                    }
                }
                .frame(minHeight: 44, alignment: .leading)
            }
        case .loaded(let recipe):
            if recipe.id == id {
                recipeContent(recipe)
            } else {
                ProgressView("Loading recipe…")
            }
        }
    }

    @ViewBuilder
    private func recipeContent(_ recipe: SavedRecipe) -> some View {
        Text(recipe.title)
            .font(.largeTitle.weight(.semibold))
            .foregroundStyle(QuietPalette.ink)
        if let servings = recipe.servings {
            Text("Serves \(servings)")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
        }
        if let notes = recipe.notes, !notes.isEmpty {
            Text(notes).font(.body).foregroundStyle(QuietPalette.muted)
        }
        VStack(alignment: .leading, spacing: 12) {
            Text("Ingredients").font(.title3.weight(.semibold))
                .foregroundStyle(QuietPalette.ink)
            if recipe.ingredients.isEmpty {
                Text("No ingredients saved.").foregroundStyle(QuietPalette.muted)
            } else {
                ForEach(recipe.ingredients) { ingredient in
                    Text(ingredientLine(ingredient)).foregroundStyle(QuietPalette.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
        if let instructions = recipe.instructions, !instructions.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
                Text("How to make it").font(.title3.weight(.semibold))
                    .foregroundStyle(QuietPalette.ink)
                Text(instructions).foregroundStyle(QuietPalette.ink)
            }
        }
        if let link = MealLibraryText.openableURL(recipe.recipeUrl) {
            Link("Open recipe link", destination: link)
                .frame(minHeight: 52, alignment: .leading)
        }
    }

    private func ingredientLine(_ ingredient: SavedIngredient) -> String {
        let parts = [ingredient.quantity, ingredient.unit, ingredient.name]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        return parts.joined(separator: " ")
    }

}
