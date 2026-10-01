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
    @FocusState private var focusedField: String?
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
                    RecipeDraftField(label: "Name", text: $draft.title, key: "name", focus: $focusedField)
                    RecipeDraftField(
                        label: "Servings", text: $draft.servings, key: "servings", focus: $focusedField,
                        keyboard: .numberPad)
                    RecipeDraftField(
                        label: "Cooking instructions", text: $draft.instructions, key: "instructions",
                        focus: $focusedField, axis: .vertical, lines: 3...8)
                }
                Section("Ingredients") {
                    ForEach(Array(draft.ingredients.enumerated()), id: \.element.id) { position, ingredient in
                        RecipeEditIngredientRow(
                            value: identifiedDraftBinding(for: ingredient, in: $draft.ingredients),
                            position: position + 1, focus: $focusedField)
                    }
                    .onDelete {
                        focusedField = nil
                        draft.ingredients.remove(atOffsets: $0)
                    }
                    .onMove {
                        focusedField = nil
                        draft.ingredients.move(fromOffsets: $0, toOffset: $1)
                    }
                    Button("Add ingredient", systemImage: "plus") { draft.ingredients.append(RecipeEditIngredient()) }
                        .disabled(draft.ingredients.count >= 200)
                }
                Section("Optional details") {
                    RecipeDraftField(
                        label: "Recipe link", text: $draft.link, key: "link", focus: $focusedField, keyboard: .URL
                    )
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    RecipeDraftField(
                        label: "Notes", text: $draft.notes, key: "notes", focus: $focusedField, axis: .vertical,
                        lines: 2...5)
                    Text("Changes affect future uses. Existing meal plans keep their captured recipe.").font(.footnote)
                }
                if let notice { Text(notice) }
            }
            .disabled(saving)
            .modifier(RecipeEditorKeyboard(focus: $focusedField))
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
            .confirmationDialog("Discard recipe changes?", isPresented: $discard, titleVisibility: .visible) {
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
        focusedField = nil
        saving = true
        defer { saving = false }
        if await model.editRecipe(draft, context: context) {
            dismiss()
        } else {
            notice = "Could not save these changes. Your draft stays here. Close and reopen to load a newer recipe."
        }
    }
}
