import SwiftUI

struct MealReplacementSheet: View {
    @ObservedObject var model: SessionModel
    let target: MealMoveTarget
    @Environment(\.dismiss) private var dismiss
    @State private var context: MealMoveContext?
    @State private var title = ""
    @State private var useSavedRecipe = false
    @State private var selectedId: UUID?
    @State private var notice: String?
    @State private var saving = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Replacing") {
                    Text(context?.meal.title ?? target.meal.title).font(.headline)
                    Text(
                        "\(MealWeekScreen.label(context?.meal.date ?? target.meal.date)), \((context?.meal.slot ?? target.meal.slot).label.lowercased())"
                    )
                    .foregroundStyle(QuietPalette.muted)
                }
                Section("New meal") {
                    Picker("Choose from", selection: $useSavedRecipe) {
                        Text("One-off meal").tag(false)
                        Text("Saved meals").tag(true)
                    }
                    if !useSavedRecipe {
                        TextField("Meal name", text: $title).textInputAutocapitalization(.sentences)
                    }
                }.disabled(saving)
                if useSavedRecipe {
                    MealSavedChoice(model: model, selectedId: $selectedId).disabled(saving)
                }
                Section {
                    Text("The new meal takes this slot. The old recipe and any linked preparation will not carry over.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                if let notice {
                    Text(notice)
                    Button("Refresh week") { Task { await load() } }.disabled(saving)
                } else if context == nil {
                    ProgressView("Checking the week…")
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Replace meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Replace") { Task { await save() } }
                        .disabled(
                            saving || !valid || model.mealReplacement != nil || model.mealMove != nil
                                || model.mealRecipeReplacement != nil)
                }
            }
            .interactiveDismissDisabled(saving)
            .task { await load() }
            .onChange(of: useSavedRecipe) { _, saved in
                selectedId = nil
                if saved { Task { await model.refreshMealLibrary() } }
            }
        }.tint(QuietPalette.accent)
    }

    private var valid: Bool {
        guard let context else { return false }
        if useSavedRecipe { return chosenRecipe != nil }
        return (try? ReplaceMeal(week: context.source, meal: context.meal, operationId: UUID(), title: title)) != nil
    }

    private var chosenRecipe: (SavedRecipe, String)? {
        guard let context, let selectedId,
            case .loaded(let listing) = model.mealLibrary,
            model.savedRecipeRevision == listing.revision,
            case .loaded(let recipe) = model.savedRecipe, recipe.id == selectedId,
            listing.meals.contains(where: { $0.id == recipe.id && $0.title == recipe.title }),
            (try? ReplaceSavedRecipe(
                week: context.source, meal: context.meal, recipe: recipe,
                libraryRevision: listing.revision, operationId: UUID())) != nil
        else { return nil }
        return (recipe, listing.revision)
    }

    private func load() async {
        context = nil
        notice = nil
        do {
            context = try await model.loadMealMove(source: target.source, target: target.source, entry: target.meal.id)
        } catch { notice = "Could not check this meal. Refresh before replacing it." }
    }

    private func save() async {
        guard !saving, valid, let context else { return }
        saving = true
        defer { saving = false }
        let accepted: Bool
        if useSavedRecipe, let (recipe, revision) = chosenRecipe {
            accepted = await model.replaceMealWithRecipe(context, recipe: recipe, libraryRevision: revision)
        } else {
            accepted = await model.replaceMeal(context, title: title)
        }
        if accepted {
            dismiss()
        } else {
            notice = "Could not save this replacement. Refresh and try again."
        }
    }
}
