import SwiftUI

struct MealAddSheet: View {
    @ObservedObject var model: SessionModel
    let target: MealSlotTarget
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var useSaved = false
    @State private var selectedId: UUID?
    @State private var saving = false
    @State private var errorText: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Meal source", selection: $useSaved) {
                        Text("One-off").tag(false)
                        Text("Saved meal").tag(true)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("\(target.slot.label) · \(target.date.value)")
                }
                if useSaved {
                    MealSavedChoice(model: model, selectedId: $selectedId)
                } else {
                    Section {
                        TextField("What are you having?", text: $title)
                            .textInputAutocapitalization(.sentences)
                            .submitLabel(.done)
                    } footer: {
                        Text("Shared with your household · up to 120 characters.")
                    }
                }
                if let day = target.date.localDay() { SchedulingWarningSection(session: model, day: day) }
                if let errorText {
                    Section { Text(errorText).foregroundStyle(QuietPalette.muted) }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Add meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        saving = true
                        Task {
                            let accepted = await save()
                            if accepted {
                                dismiss()
                            } else {
                                errorText = model.mealNotice ?? "Could not save this meal. Try again."
                                saving = false
                            }
                        }
                    }
                    .disabled(
                        saving || model.mealPlacement != nil || model.mealRemoval != nil
                            || model.mealRecipePlacement != nil || !validInput)
                }
            }
            .task(id: useSaved) {
                if useSaved {
                    selectedId = nil
                    await model.refreshMealLibrary()
                }
            }
        }
    }

    private var validInput: Bool {
        if useSaved {
            guard let selectedId, case .loaded(let recipe) = model.savedRecipe,
                case .loaded(let listing) = model.mealLibrary,
                model.savedRecipeRevision == listing.revision
            else { return false }
            return recipe.id == selectedId
        }
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        return !trimmed.isEmpty && trimmed.unicodeScalars.count <= 120
    }

    private func save() async -> Bool {
        if useSaved {
            guard let selectedId, case .loaded(let recipe) = model.savedRecipe,
                recipe.id == selectedId
            else { return false }
            return await model.placeSavedRecipe(
                date: target.date, slot: target.slot, recipe: recipe)
        }
        return await model.placeMeal(date: target.date, slot: target.slot, title: title)
    }
}
