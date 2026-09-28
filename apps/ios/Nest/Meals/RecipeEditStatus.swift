import SwiftUI

struct RecipeEditStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedRecipeEdit

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(saved.baseline.title).font(.headline)
            switch saved.state {
            case .pending:
                Text("This save is stored on this iPhone. Retry the same request to avoid applying a second edit.")
                Button("Retry save") { Task { await model.retryRecipeEdit() } }
            case .acknowledged:
                Text("Your recipe was saved. Refresh to check its details.")
                Button("Refresh recipe") { Task { await model.retryRecipeEdit() } }
            case .conflict:
                Text(
                    "The library changed and this save was rejected. Discard the request before editing the current recipe."
                )
                Button("Discard rejected request") { Task { await model.discardRecipeEditConflict() } }
            }
        }
        .disabled(model.recipeEditSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
