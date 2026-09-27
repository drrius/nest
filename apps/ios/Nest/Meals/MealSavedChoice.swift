import SwiftUI

struct MealSavedChoice: View {
    @ObservedObject var model: SessionModel
    @Binding var selectedId: UUID?
    @State private var loadingMore = false

    var body: some View {
        Section("Saved meals") {
            if let notice = model.mealLibraryNotice {
                Text(notice).foregroundStyle(QuietPalette.muted)
                Button("Refresh saved meals") { refresh() }
            }
            switch model.mealLibrary {
            case .idle, .loading:
                ProgressView("Loading saved meals…")
            case .failed:
                Button("Try again") { refresh() }
            case .loaded(let listing):
                if listing.meals.isEmpty {
                    Text("No saved meals yet. Type a one-off meal instead.")
                        .foregroundStyle(QuietPalette.muted)
                }
                ForEach(listing.meals) { meal in
                    Button {
                        selectedId = meal.id
                        Task { await model.loadSavedRecipe(meal.id) }
                    } label: {
                        HStack {
                            Text(meal.title)
                            Spacer()
                            if selectedId == meal.id {
                                Image(systemName: "checkmark")
                            }
                        }
                        .frame(minHeight: 44)
                    }
                    .accessibilityValue(selectedId == meal.id ? "Selected" : "")
                }
                if listing.nextAfterId != nil {
                    Button("Load more saved meals") {
                        loadingMore = true
                        Task {
                            await model.loadNextMealLibraryPage()
                            loadingMore = false
                        }
                    }
                    .disabled(loadingMore)
                    .frame(minHeight: 44, alignment: .leading)
                }
            }
        }
        if selectedId != nil { review }
    }

    @ViewBuilder
    private var review: some View {
        Section("Review saved recipe") {
            switch model.savedRecipe {
            case .idle, .loading:
                ProgressView("Loading recipe…")
            case .missing:
                Text("This recipe is no longer saved. Refresh the library.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Refresh library") { refresh() }
            case .failed:
                Text("Could not load this recipe. Refresh the library and choose it again.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Refresh library") { refresh() }
            case .loaded(let recipe):
                if recipe.id == selectedId {
                    Text(recipe.title).font(.headline)
                    if let servings = recipe.servings { Text("Serves \(servings)") }
                    if recipe.ingredients.isEmpty {
                        Text("No ingredients saved.").foregroundStyle(QuietPalette.muted)
                    } else {
                        ForEach(recipe.ingredients) { ingredient in
                            Text(ingredientLine(ingredient))
                        }
                    }
                    if let instructions = recipe.instructions, !instructions.isEmpty {
                        Text(instructions)
                    }
                } else {
                    ProgressView("Loading recipe…")
                }
            }
        }
    }

    private func refresh() {
        selectedId = nil
        Task { await model.refreshMealLibrary() }
    }

    private func ingredientLine(_ ingredient: SavedIngredient) -> String {
        [ingredient.quantity, ingredient.unit, ingredient.name]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }
}
