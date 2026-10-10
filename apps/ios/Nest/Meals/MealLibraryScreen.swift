import SwiftUI

struct MealLibraryScreen: View {
    @ObservedObject var model: SessionModel
    @State private var creatingRecipe = false
    @State private var loadingMore = false
    @State private var query = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if case .loaded(let listing) = model.mealLibrary, listing.meals.count > 6 {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").foregroundStyle(NestColor.ink3)
                        TextField("Search saved meals", text: $query)
                    }
                    .padding(.horizontal, 14).frame(minHeight: 44)
                    .background(NestColor.fill, in: Capsule())
                }
                if let notice = model.mealLibraryNotice {
                    Text(notice).font(.footnote).foregroundStyle(NestColor.ink2)
                    Button("Refresh saved meals") {
                        Task { await model.refreshMealLibrary() }
                    }
                    .frame(minHeight: 44, alignment: .leading)
                }
                if let saved = model.recipeEdit { RecipeEditStatus(model: model, saved: saved) }
                if let notice = model.recipeEditNotice { Text(notice).foregroundStyle(NestColor.ink2) }
                if let saved = model.recipeArchive { RecipeArchiveStatus(model: model, saved: saved) }
                if let notice = model.recipeArchiveNotice { Text(notice).foregroundStyle(NestColor.ink2) }
                if let saved = model.recipeCreation { RecipeCreationStatus(model: model, saved: saved) }
                if let notice = model.recipeCreationNotice { Text(notice).foregroundStyle(NestColor.ink2) }
                content
            }
            .padding(20)
        }
        .nestScreen()
        .navigationTitle("Saved meals")
        .navigationBarTitleDisplayMode(.large)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                QuietToolbarButton("New recipe", systemImage: "plus") { creatingRecipe = true }
                    .disabled(model.recipeCreation != nil || model.recipeArchive != nil || model.recipeEdit != nil)
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
                Text(
                    model.mealLibraryFresh
                        ? "No saved meals yet." : "No meals in this saved copy. Refresh to check the library."
                )
                .foregroundStyle(NestColor.ink2)
                .frame(maxWidth: .infinity, minHeight: 120, alignment: .leading)
            } else {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
                    ForEach(listing.meals.filter(matches)) { meal in
                        NavigationLink {
                            SavedRecipeScreen(model: model, id: meal.id)
                        } label: {
                            tile(meal)
                        }
                        .buttonStyle(NestPressStyle())
                    }
                }
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

    private func matches(_ meal: SavedMealSummary) -> Bool {
        let text = query.trimmingCharacters(in: .whitespaces)
        return text.isEmpty || meal.title.localizedCaseInsensitiveContains(text)
    }

    private func tile(_ meal: SavedMealSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            EmojiTile(emoji: MealEmoji.emoji(for: meal.title), size: 52)
                .padding(.bottom, 8)
            Text(meal.title).font(.subheadline.weight(.semibold)).foregroundStyle(NestColor.ink)
                .multilineTextAlignment(.leading).lineLimit(2)
            if let servings = meal.servings {
                Text("Serves \(servings)").font(.footnote).foregroundStyle(NestColor.ink2)
            }
        }
        .frame(maxWidth: .infinity, minHeight: 140, alignment: .topLeading)
        .nestCard(padding: 14, radius: 22)
        .accessibilityElement(children: .combine)
    }
}
