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

    var body: some View {
        NavigationStack {
            Form {
                Section("Recipe") {
                    TextField("Name", text: $title)
                    LabeledContent("Servings") {
                        TextField("Servings", text: $servings)
                            .keyboardType(.numberPad).multilineTextAlignment(.trailing)
                            .accessibilityLabel("Servings")
                    }
                    TextField("Cooking instructions", text: $instructions, axis: .vertical).lineLimit(3...8)
                }
                Section("Ingredients") {
                    ForEach($ingredients) { $ingredient in
                        RecipeIngredientEditor(value: $ingredient) {
                            ingredients.removeAll { $0.id == ingredient.id }
                        }
                    }
                    Button("Add ingredient", systemImage: "plus") { ingredients.append(RecipeIngredientFields()) }
                        .disabled(ingredients.count >= 200)
                }
                Section("Optional details") {
                    TextField("Recipe link", text: $link).keyboardType(.URL)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...5)
                }
                Section {
                    Text(
                        "Give your recipe a name, servings, instructions and at least one ingredient. Quantities and units stay separate."
                    )
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
                    if let notice { Text(notice) }
                    if context == nil {
                        Button("Refresh saved meals") { Task { await load() } }
                    }
                }
            }
            .disabled(saving)
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("New recipe")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { confirmingDiscard = true }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Save") { Task { await save() } }
                        .disabled(saving || context == nil || draft == nil || model.recipeCreation != nil)
                }
            }
            .interactiveDismissDisabled()
            .confirmationDialog("Discard this recipe draft?", isPresented: $confirmingDiscard) {
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

struct RecipeIngredientEditor: View {
    @Binding var value: RecipeIngredientFields
    let remove: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            TextField("Ingredient", text: $value.name)
            TextField("Quantity (optional)", text: $value.quantity)
            TextField("Unit (optional)", text: $value.unit)
            TextField("Ingredient note (optional)", text: $value.note, axis: .vertical)
            Button("Remove ingredient", role: .destructive, action: remove)
                .accessibilityLabel("Remove \(value.name.isEmpty ? "ingredient" : value.name)")
        }.padding(.vertical, 8)
    }
}
