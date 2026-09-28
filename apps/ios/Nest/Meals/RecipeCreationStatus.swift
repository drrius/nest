import SwiftUI

struct RecipeCreationStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedRecipeCreation

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(saved.command.recipe.title).font(.headline)
            switch saved.state {
            case .pending:
                Text("This save is stored on this iPhone. Retry the same request to avoid adding the recipe twice.")
                Button("Retry save") { Task { await model.retryRecipeCreation() } }
            case .acknowledged:
                Text("Your recipe was saved. Refresh to check its details.")
                Button("Refresh recipe") { Task { await model.retryRecipeCreation() } }
            case .conflict:
                Text(
                    "The library changed and this save was rejected. Discard the request before creating a new recipe.")
                Button("Discard rejected request") { Task { await model.discardRecipeCreationConflict() } }
            }
        }
        .disabled(model.recipeCreationSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
