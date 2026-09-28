import SwiftUI

struct RecipeEditSheet: View {
    @ObservedObject var model: SessionModel
    let id: UUID
    @State private var context: RecipeArchiveContext?
    @State private var notice: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        if let context {
            RecipeEditForm(model: model, context: context)
        } else {
            NavigationStack {
                VStack(spacing: 16) {
                    if let notice {
                        Text(notice)
                        Button("Try again") { Task { await load() } }
                    } else {
                        ProgressView("Loading recipe…")
                    }
                }
                .padding(24)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(QuietPalette.background)
                .navigationTitle("Edit recipe")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                .task { await load() }
            }
        }
    }

    private func load() async {
        do { context = try await model.loadRecipeArchiveContext(id) } catch {
            notice = "Could not load the current recipe. Connect and try again."
        }
    }
}

struct RecipeEditForm: View {
    @ObservedObject var model: SessionModel
    let context: RecipeArchiveContext
    @State private var draft: RecipeEditDraft
    @State private var saving = false
    @State private var discard = false
    @State private var notice: String?
    @Environment(\.dismiss) private var dismiss

    init(model: SessionModel, context: RecipeArchiveContext) {
        self.model = model
        self.context = context
        _draft = State(initialValue: RecipeEditDraft(context.recipe))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $draft.title)
                    LabeledContent("Servings") {
                        TextField("Unknown", text: $draft.servings).keyboardType(.numberPad)
                            .multilineTextAlignment(.trailing).accessibilityLabel("Servings")
                    }
                    TextField("Instructions", text: $draft.instructions, axis: .vertical).lineLimit(3...8)
                }
                Section("Ingredients") {
                    ForEach($draft.ingredients) { $ingredient in
                        VStack(alignment: .leading, spacing: 12) {
                            TextField("Ingredient", text: $ingredient.name)
                            TextField("Quantity", text: $ingredient.quantity)
                            TextField("Unit", text: $ingredient.unit)
                            TextField("Note", text: $ingredient.note, axis: .vertical)
                        }.padding(.vertical, 8)
                    }
                    .onDelete { draft.ingredients.remove(atOffsets: $0) }
                    .onMove { draft.ingredients.move(fromOffsets: $0, toOffset: $1) }
                    Button("Add ingredient", systemImage: "plus") { draft.ingredients.append(RecipeEditIngredient()) }
                        .disabled(draft.ingredients.count >= 200)
                }
                Section("Optional details") {
                    TextField("Recipe link", text: $draft.link).keyboardType(.URL)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Notes", text: $draft.notes, axis: .vertical).lineLimit(2...5)
                    Text("Changes affect future uses. Existing meal plans keep their captured recipe.").font(.footnote)
                }
                if let notice { Text(notice) }
            }
            .disabled(saving)
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Edit recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { discard = true }.disabled(saving) }
                ToolbarItem(placement: .primaryAction) { EditButton().disabled(saving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled()
            .confirmationDialog("Discard recipe changes?", isPresented: $discard) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }.tint(QuietPalette.accent)
    }

    private var canSave: Bool {
        !saving && model.recipeEdit == nil && model.recipeCreation == nil && model.recipeArchive == nil
            && (try? draft.command(operation: UUID(), revision: context.revision)) != nil
    }

    private func save() async {
        guard canSave else { return }
        saving = true
        defer { saving = false }
        if await model.editRecipe(draft, context: context) {
            dismiss()
        } else {
            notice = "Could not save these changes. Your draft stays here. Close and reopen to load a newer recipe."
        }
    }
}
