import SwiftUI

struct IngredientReviewScreen: View {
    @ObservedObject var model: SessionModel
    let week: MealWeekStart
    @State private var context: IngredientReviewContext?
    @State private var choices: [MealIngredientChoice] = []
    @State private var busy = false
    @State private var notice: String?
    @State private var confirm = false
    @State private var discard = false
    @State private var request = UUID()
    @FocusState private var focusedField: String?

    var body: some View {
        Form {
            Section {
                Text("Choose what you need. Leave pantry items unchecked. Quantities stay separate for each meal.")
                Text("Week of \(week.date.value)").font(.caption).foregroundStyle(QuietPalette.muted)
            }
            if let context, model.generation == context.generation, model.status == .ready(context.member) {
                review(context)
            }
            if let notice { Section { Text(notice).foregroundStyle(QuietPalette.muted) } }
            if busy { ProgressView("Checking ingredients…") }
            if context == nil && !busy { Button("Try again") { Task { await load() } } }
        }
        .disabled(busy)
        .scrollContentBackground(.hidden)
        .scrollDismissesKeyboard(.interactively)
        .background(QuietPalette.background)
        .tint(QuietPalette.accent)
        .navigationTitle("Review ingredients")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedField = nil }.frame(minHeight: 44)
            }
        }
        .task(id: model.generation) { await load() }
        .confirmationDialog(
            "Add \(selectedCount) \(selectedCount == 1 ? "ingredient" : "ingredients") to groceries?",
            isPresented: $confirm, titleVisibility: .visible
        ) {
            Button("Add to groceries") { Task { await add() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Only checked ingredients will be added, with the quantities and units shown.")
        }
        .confirmationDialog("Discard the rejected request?", isPresented: $discard) {
            Button("Discard request", role: .destructive) { Task { await recover() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder private func review(_ context: IngredientReviewContext) -> some View {
        if let saved = context.saved, saved.pending != nil {
            Section(saved.conflicted ? "Review needed" : "Saved request") {
                Text(
                    saved.conflicted
                        ? "The meal plan changed or this request was rejected. Discard it, then review the current ingredients."
                        : "The result is not confirmed. Retry this exact request when online.")
                Text("\(saved.pending?.selected.count ?? 0) selected ingredients")
                if saved.conflicted {
                    Button("Discard rejected request") { discard = true }
                } else {
                    Button("Retry addition") { Task { await retry() } }
                }
            }
        } else if let receipt = context.saved?.receipt {
            Section("Added to groceries") {
                Text(
                    "\(receipt.ingredients.count) \(receipt.ingredients.count == 1 ? "ingredient" : "ingredients") confirmed. Items already added were not duplicated."
                )
                NavigationLink("Open groceries") { GroceriesScreen(model: model) }
                Button("Review current ingredients") { Task { await refresh(context) } }
            }
        } else if let listing = context.listing {
            Section("Ingredients") {
                if listing.ingredients.isEmpty { Text("No ingredients to add for this week.") }
                ForEach(choices) { choice in
                    if let row = listing.ingredients.first(where: { $0.id == choice.id }) {
                        IngredientChoiceRow(
                            choice: ingredientChoiceBinding(for: choice, choices: $choices), row: row,
                            focus: $focusedField)
                    }
                }
            }
            if !listing.skipped.isEmpty {
                Section {
                    Text(
                        "\(listing.skipped.count) meals have no ingredient list or are leftovers. They add no groceries."
                    ).font(.footnote)
                }
            }
            Section {
                Button("Save choices for later") { Task { await saveChoices() } }
                Text("Save choices before leaving if you want to finish this review later.").font(.footnote)
                Button("Add \(selectedCount) to groceries") { confirm = true }
                    .disabled(selectedCount == 0 || !validSelection(context))
            }
        } else {
            Button("Load current ingredients") { Task { await refresh(context) } }
        }
    }

    private var selectedCount: Int { choices.filter(\.selected).count }

    private func validSelection(_ context: IngredientReviewContext) -> Bool {
        guard let listing = context.listing else { return false }
        return
            (try? AddMealIngredients(
                operationId: UUID(), weekStart: week, expectedRevision: listing.revision,
                selected: choices.filter(\.selected).map(\.ingredient)
            ).validated()) != nil
    }

    private func load() async {
        let id = UUID()
        request = id
        busy = true
        context = nil
        choices = []
        notice = nil
        defer { if request == id { busy = false } }
        do {
            let loaded = try await model.ingredientReviewContext(week: week)
            guard request == id else { return }
            context = loaded
            if loaded.saved?.pending == nil && loaded.saved?.receipt == nil {
                let fresh = try await model.refreshIngredientReview(loaded)
                guard request == id else { return }
                try model.requireIngredientContext(fresh)
                context = fresh
                choices = fresh.saved?.choices ?? []
            }
        } catch { if request == id { notice = "Could not load ingredients. Connect and try again." } }
    }

    private func refresh(_ original: IngredientReviewContext) async {
        busy = true
        defer { busy = false }
        do {
            let fresh = try await model.refreshIngredientReview(original)
            try model.requireIngredientContext(fresh)
            context = fresh
            choices = fresh.saved?.choices ?? []
            notice = nil
        } catch { notice = "Could not refresh ingredients. Your saved request is retained." }
    }

    private func saveChoices() async {
        guard let original = context else { return }
        busy = true
        defer { busy = false }
        do {
            let saved = try await model.saveIngredientChoices(choices, context: original)
            try model.requireIngredientContext(saved)
            context = saved
            notice = "Choices saved on this iPhone. No groceries were added."
        } catch { notice = "Could not save these choices. Keep this review open and try again." }
    }

    private func add() async {
        guard let context else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.stageReviewedIngredients(choices, context: context)
            try await model.retryReviewedIngredients(context)
            await load()
        } catch {
            await load()
            notice = "Could not confirm the addition. Review the saved request before retrying."
        }
    }

    private func retry() async {
        guard let context else { return }
        busy = true
        defer { busy = false }
        do { try await model.retryReviewedIngredients(context) } catch {
            notice = "Could not confirm the addition. The saved request is retained."
        }
        await load()
    }

    private func recover() async {
        guard let context else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.discardIngredientConflict(context)
            await load()
        } catch {
            notice = "Could not discard the rejected request. Try again."
        }
    }
}
