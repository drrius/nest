import SwiftUI

struct RecipeCreateSheet: View {
    @ObservedObject var model: SessionModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var servings = "2"
    @State private var instructions = ""
    @State private var link = ""
    @State private var notes = ""
    @State private var ingredients = [RecipeIngredientFields()]
    @State private var context: RecipeCreateContext?
    @State private var notice: String?
    @State private var saving = false
    @State private var confirmingDiscard = false
    @FocusState private var focusedField: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    RecipeDraftField(label: "Name", text: $title, key: "name", focus: $focusedField)
                    RecipeDraftField(
                        label: "Servings", text: $servings, key: "servings", focus: $focusedField, keyboard: .numberPad)
                    RecipeDraftField(
                        label: "Cooking instructions", text: $instructions, key: "instructions",
                        focus: $focusedField, axis: .vertical, lines: 3...8)
                }
                Section("Ingredients") {
                    ForEach(Array(ingredients.enumerated()), id: \.element.id) { position, ingredient in
                        RecipeIngredientEditor(
                            value: identifiedDraftBinding(for: ingredient, in: $ingredients),
                            position: position + 1, focus: $focusedField
                        ) {
                            focusedField = nil
                            ingredients.removeAll { $0.id == ingredient.id }
                        }
                    }
                    Button("Add ingredient", systemImage: "plus") { ingredients.append(RecipeIngredientFields()) }
                        .disabled(ingredients.count >= 200)
                }
                Section("Optional details") {
                    RecipeDraftField(
                        label: "Recipe link", text: $link, key: "link", focus: $focusedField, keyboard: .URL
                    )
                    .textInputAutocapitalization(.never).autocorrectionDisabled()
                    RecipeDraftField(
                        label: "Notes", text: $notes, key: "notes", focus: $focusedField, axis: .vertical, lines: 2...5)
                }
                Section {
                    Text(
                        "Give your recipe a name, servings, instructions and at least one ingredient. Quantities and units stay separate."
                    )
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
                    if let notice { Text(notice) }
                    if context == nil || notice != nil {
                        Button("Refresh saved meals") { Task { await load() } }
                    }
                }
            }
            .disabled(saving)
            .modifier(RecipeEditorKeyboard(focus: $focusedField))
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("New recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    QuietToolbarButton("Cancel", systemImage: "xmark") { confirmingDiscard = true }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    QuietToolbarButton(saving ? "Saving…" : "Save", systemImage: "checkmark") {
                        Task { await save() }
                    }
                    .disabled(saving || context == nil || draft == nil || model.recipeCreation != nil)
                }
            }
            .interactiveDismissDisabled()
            .alert("Discard draft?", isPresented: $confirmingDiscard) {
                Button("Discard draft", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
            .task { await load() }
        }.tint(QuietPalette.accent)
    }

    private var draft: RecipeDraft? {
        guard let count = Int(servings) else { return nil }
        return try? RecipeDraft(
            title: title, servings: count, instructions: instructions,
            recipeUrl: link.isEmpty ? nil : link, notes: notes.isEmpty ? nil : notes,
            ingredients: ingredients.map(\.draft)
        ).validated()
    }

    private func load() async {
        do {
            context = try await model.loadRecipeCreateContext()
            notice = nil
        } catch {
            context = nil
            notice = "Connect to load the current library before saving. Your draft stays here."
        }
    }

    private func save() async {
        guard !saving, let context, let draft else { return }
        focusedField = nil
        saving = true
        defer { saving = false }
        if await model.createRecipe(draft, context: context) {
            dismiss()
        } else {
            notice = "Could not save this draft. Refresh saved meals and try again."
        }
    }
}

struct RecipeIngredientFields: Identifiable {
    let id = UUID()
    var name = ""
    var quantity = ""
    var unit = ""
    var note = ""
    var draft: RecipeIngredientDraft {
        RecipeIngredientDraft(
            name: name, quantity: quantity.isEmpty ? nil : quantity,
            unit: unit.isEmpty ? nil : unit, categoryId: nil, note: note.isEmpty ? nil : note)
    }
}
