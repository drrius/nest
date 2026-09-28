import SwiftUI

struct RecipeArchiveSheet: View {
    @ObservedObject var model: SessionModel
    let id: UUID
    @Environment(\.dismiss) private var dismiss
    @State private var context: RecipeArchiveContext?
    @State private var notice: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                if let context {
                    Section {
                        Text(context.recipe.title).font(.headline)
                        Text(
                            "This recipe will leave Saved meals. Meals already in your plan keep their captured recipe details."
                        )
                        Button("Archive recipe", role: .destructive) { Task { await archive(context) } }
                            .disabled(saving || model.recipeArchive != nil || model.recipeCreation != nil)
                    }
                } else if notice == nil {
                    ProgressView("Checking recipe…")
                }
                if let notice {
                    Section {
                        Text(notice)
                        Button("Refresh recipe") { Task { await load() } }.disabled(saving)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Archive recipe?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(saving) }
            }
            .interactiveDismissDisabled(saving)
            .task { await load() }
        }.tint(QuietPalette.accent)
    }

    private func load() async {
        context = nil
        notice = nil
        do { context = try await model.loadRecipeArchiveContext(id) } catch {
            notice = "Could not check this recipe. Refresh before archiving."
        }
    }

    private func archive(_ context: RecipeArchiveContext) async {
        guard !saving else { return }
        saving = true
        defer { saving = false }
        if await model.archiveRecipe(context: context) {
            dismiss()
        } else {
            notice = "Could not save this archive request. Refresh and try again."
        }
    }
}

struct RecipeArchiveStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedRecipeArchive
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Recipe archive").font(.headline)
            switch saved.state {
            case .pending:
                Text("This archive request is saved on this iPhone. Retry to confirm its result.")
                Button("Retry archive") { Task { await model.retryRecipeArchive() } }
            case .acknowledged:
                Text("The recipe was archived. Refresh to see the updated library.")
                Button("Refresh library") { Task { await model.retryRecipeArchive() } }
            case .conflict:
                Text("The library changed and this archive was rejected. Discard it and review the current recipe.")
                Button("Discard rejected archive") { Task { await model.discardRecipeArchiveConflict() } }
            }
        }
        .disabled(model.recipeArchiveSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
