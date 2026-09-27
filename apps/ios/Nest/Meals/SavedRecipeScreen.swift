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
                RecipeContentView(recipe: recipe.content)
            } else {
                ProgressView("Loading recipe…")
            }
        }
    }

}
