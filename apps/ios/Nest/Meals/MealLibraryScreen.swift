import SwiftUI

struct MealLibraryScreen: View {
    @ObservedObject var model: SessionModel
    @State private var creatingRecipe = false
    @State private var loadingMore = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Text("Meals you keep for another day.")
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
                if let notice = model.mealLibraryNotice {
                    Text(notice).font(.subheadline).foregroundStyle(QuietPalette.muted)
                    Button("Refresh saved meals") {
                        Task { await model.refreshMealLibrary() }
                    }
                    .frame(minHeight: 44, alignment: .leading)
                }
                if let saved = model.recipeArchive { RecipeArchiveStatus(model: model, saved: saved) }
                if let notice = model.recipeArchiveNotice { Text(notice).foregroundStyle(QuietPalette.muted) }
                if let saved = model.recipeCreation { RecipeCreationStatus(model: model, saved: saved) }
                if let notice = model.recipeCreationNotice { Text(notice).foregroundStyle(QuietPalette.muted) }
                content
            }
            .padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Saved meals")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New recipe", systemImage: "plus") { creatingRecipe = true }
                    .disabled(model.recipeCreation != nil || model.recipeArchive != nil)
            }
        }
        .sheet(isPresented: $creatingRecipe) { RecipeCreateSheet(model: model) }
        .refreshable { await model.refreshMealLibrary() }
        .task { if model.mealLibrary == .idle { await model.refreshMealLibrary() } }
    }

    @ViewBuilder
    private var content: some View {
        switch model.mealLibrary {
        case .idle, .loading:
            ProgressView("Loading saved meals…")
                .frame(maxWidth: .infinity, minHeight: 120)
        case .failed:
            Button("Try again") { Task { await model.refreshMealLibrary() } }
                .frame(minHeight: 52, alignment: .leading)
        case .loaded(let listing):
            if listing.meals.isEmpty {
                Text("No saved meals yet.")
                    .foregroundStyle(QuietPalette.muted)
                    .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            } else {
                VStack(spacing: 0) {
                    ForEach(listing.meals) { meal in
                        NavigationLink {
                            SavedRecipeScreen(model: model, id: meal.id)
                        } label: {
                            row(meal)
                        }
                        .buttonStyle(.plain)
                        if meal.id != listing.meals.last?.id { Divider() }
                    }
                }
                .padding(.horizontal, 16)
                .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
                if listing.nextAfterId != nil {
                    Button("Load more") {
                        loadingMore = true
                        Task {
                            await model.loadNextMealLibraryPage()
                            loadingMore = false
                        }
                    }
                    .disabled(loadingMore)
                    .frame(minHeight: 52, alignment: .leading)
                }
            }
        }
    }

    private func row(_ meal: SavedMealSummary) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(meal.title).font(.headline).foregroundStyle(QuietPalette.ink)
                if let servings = meal.servings {
                    Text("Serves \(servings)").font(.subheadline)
                        .foregroundStyle(QuietPalette.muted)
                }
            }
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(QuietPalette.muted)
        }
        .frame(minHeight: 68)
        .accessibilityElement(children: .combine)
    }
}
