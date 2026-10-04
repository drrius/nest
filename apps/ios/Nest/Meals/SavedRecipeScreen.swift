import SwiftUI

struct SavedRecipeScreen: View {
    @ObservedObject var model: SessionModel
    let id: UUID
    @State private var editing = false
    @State private var archiving = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let notice = model.savedRecipeNotice {
                    Text(notice).font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Recipe")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button("Edit recipe", systemImage: "pencil") { editing = true }
                    .disabled(model.recipeEdit != nil || model.recipeArchive != nil || model.recipeCreation != nil)
                Button("Archive recipe", systemImage: "archivebox") { archiving = true }
                    .disabled(model.recipeArchive != nil || model.recipeCreation != nil || model.recipeEdit != nil)
            }
        }
        .sheet(isPresented: $editing) { RecipeEditSheet(model: model, id: id) }
        .sheet(isPresented: $archiving) { RecipeArchiveSheet(model: model, id: id) }
        .task(id: libraryRevision) {
            guard libraryRevision != nil else { return }
            await model.loadSavedRecipe(id)
        }
    }

    private var libraryRevision: String? {
        guard case .loaded(let listing) = model.mealLibrary else { return nil }
        return listing.revision
    }

    @ViewBuilder
    private var content: some View {
        switch model.savedRecipe {
        case .idle:
            Button("Load recipe") { Task { await model.loadSavedRecipe(id) } }
                .frame(minHeight: 44, alignment: .leading)
        case .loading:
            ProgressView("Loading recipe…")
                .frame(maxWidth: .infinity, minHeight: 120)
        case .missing:
            Text(
                model.savedRecipeFresh
                    ? "This meal is no longer in your saved library."
                    : "This saved copy does not contain the recipe. Connect and refresh to check the library."
            )
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
