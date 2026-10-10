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
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("What do you need?").font(.largeTitle.weight(.bold)).foregroundStyle(NestColor.ink)
                        .accessibilityAddTraits(.isHeader)
                    Text("Untick anything you already have. The rest goes on the shared list.")
                        .font(.subheadline).foregroundStyle(NestColor.ink2)
                }
                if let context, model.generation == context.generation, model.status == .ready(context.member) {
                    review(context)
                }
                if let notice {
                    Label(notice, systemImage: "info.circle").font(.footnote).foregroundStyle(NestColor.ink2)
                }
                if busy { ProgressView().frame(maxWidth: .infinity) }
                if context == nil && !busy {
                    Button("Try again") { Task { await load() } }
                        .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
        }
        .disabled(busy)
        .scrollDismissesKeyboard(.interactively)
        .nestScreen()
        .tint(NestColor.accent)
        .navigationTitle("Review ingredients")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) { bottomBar }
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

    @ViewBuilder private var bottomBar: some View {
        if let context, context.saved?.pending == nil, context.saved?.receipt == nil, context.listing != nil {
            HStack(spacing: 10) {
                Button("Save for later") { Task { await saveChoices() } }
                    .buttonStyle(NestButtonStyle(kind: .plain))
                    .disabled(busy)
                Button {
                    confirm = true
                } label: {
                    Label("Add \(selectedCount) to Groceries", systemImage: "basket")
                }
                .buttonStyle(NestButtonStyle(kind: .primary, fullWidth: true))
                .disabled(busy || selectedCount == 0 || !validSelection(context))
            }
            .padding(.horizontal, 20).padding(.bottom, 8)
        }
    }

    @ViewBuilder private func review(_ context: IngredientReviewContext) -> some View {
        if let saved = context.saved, saved.pending != nil {
            VStack(alignment: .leading, spacing: 12) {
                Text(saved.conflicted ? "Review needed" : "Saved request").font(.headline)
                Text(
                    saved.conflicted
                        ? "The meal plan changed or this request was rejected. Discard it, then review the current ingredients."
                        : "The result isn’t confirmed yet. Retry this exact request when online."
                ).foregroundStyle(NestColor.ink2)
                Text("\(saved.pending?.selected.count ?? 0) selected ingredients").font(.footnote)
                if saved.conflicted {
                    Button("Discard rejected request") { discard = true }
                        .buttonStyle(NestButtonStyle(kind: .plain, small: true))
                } else {
                    Button("Retry addition") { Task { await retry() } }
                        .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
                }
            }
            .nestCard()
        } else if let receipt = context.saved?.receipt {
            VStack(alignment: .leading, spacing: 12) {
                Label("Added to Groceries", systemImage: "checkmark.circle.fill")
                    .font(.headline).foregroundStyle(NestColor.good)
                Text(
                    "\(receipt.ingredients.count) \(receipt.ingredients.count == 1 ? "ingredient" : "ingredients") added. Anything already there wasn’t duplicated."
                ).foregroundStyle(NestColor.ink2)
                HStack(spacing: 10) {
                    NavigationLink("Open groceries") { GroceriesScreen(model: model) }
                        .buttonStyle(NestButtonStyle(kind: .primary, small: true))
                    Button("Review current ingredients") { Task { await refresh(context) } }
                        .buttonStyle(NestButtonStyle(kind: .plain, small: true))
                }
            }
            .nestCard()
        } else if let listing = context.listing {
            VStack(spacing: 0) {
                if listing.ingredients.isEmpty {
                    Text("No ingredients to add for this week.").foregroundStyle(NestColor.ink2)
                        .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                }
                ForEach(Array(choices.enumerated()), id: \.element.id) { index, choice in
                    if let row = listing.ingredients.first(where: { $0.id == choice.id }) {
                        if index > 0 { NestRowDivider(leading: 54) }
                        IngredientChoiceRow(
                            choice: identifiedDraftBinding(for: choice, in: $choices), row: row,
                            focus: $focusedField)
                    }
                }
            }
            .nestCard(padding: 0)
            if !listing.skipped.isEmpty {
                Text("\(listing.skipped.count) meals have no ingredient list or are leftovers, so they add nothing.")
                    .font(.footnote).foregroundStyle(NestColor.ink3)
            }
        } else {
            Button("Load current ingredients") { Task { await refresh(context) } }
                .buttonStyle(NestButtonStyle(kind: .secondary, small: true))
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
