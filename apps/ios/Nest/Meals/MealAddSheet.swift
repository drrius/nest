import SwiftUI

struct MealAddSheet: View {
    @ObservedObject var model: SessionModel
    let target: MealSlotTarget
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var loadingMore = false
    @State private var useSaved = false
    @State private var selectedId: UUID?
    @State private var saving = false
    @State private var errorText: String?
    @FocusState private var editingTitle: Bool

    @State private var query = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    searchField
                    if let day = target.date.localDay() {
                        SchedulingWarningSection(session: model, day: day, plain: true).padding(.horizontal, 4)
                    }
                    if !query.trimmingCharacters(in: .whitespaces).isEmpty { oneOffRow }
                    savedResults
                    if let errorText {
                        Text(errorText).font(.footnote).foregroundStyle(NestColor.warn)
                    }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .nestScreen()
            .navigationTitle(sheetTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    QuietToolbarButton("Cancel", systemImage: "xmark") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    QuietToolbarButton("Save", systemImage: "checkmark") { submit() }
                        .disabled(
                            saving || model.mealPlacement != nil || model.mealRemoval != nil
                                || model.mealRecipePlacement != nil || !validInput)
                }
            }
            .task { await model.refreshMealLibrary() }
            .onAppear { editingTitle = true }
            .onChange(of: query) { _, value in
                useSaved = false
                selectedId = nil
                title = value
            }
        }
    }

    private var sheetTitle: String {
        let style = Date.FormatStyle(timeZone: TimeZone(secondsFromGMT: 0)!).weekday(.wide)
        let day = target.date.localDay(timeZone: TimeZone(secondsFromGMT: 0)!)?.formatted(style) ?? ""
        return "\(day) \(target.slot.label.lowercased())".trimmingCharacters(in: .whitespaces)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass").foregroundStyle(NestColor.ink3)
            TextField("Search or type a meal", text: $query)
                .textInputAutocapitalization(.sentences)
                .submitLabel(.done)
                .focused($editingTitle)
                .onSubmit { if validInput { submit() } }
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .background(NestColor.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(editingTitle ? NestColor.accent : Color.clear, lineWidth: 2))
    }

    private var oneOffRow: some View {
        Button {
            useSaved = false
            selectedId = nil
            title = query
        } label: {
            HStack(spacing: 12) {
                IconTile(systemName: "plus", domain: .house, size: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Add “\(query.trimmingCharacters(in: .whitespaces))”").foregroundStyle(NestColor.ink)
                    Text("Just for this day · shared with your household")
                        .font(.footnote).foregroundStyle(NestColor.ink2)
                }
                Spacer()
                if !useSaved { Image(systemName: "checkmark").foregroundStyle(NestColor.accentInk) }
            }
            .padding(12)
            .nestCard(padding: 0, radius: 20)
        }
        .buttonStyle(NestPressStyle())
    }

    @ViewBuilder
    private var savedResults: some View {
        if case .loaded(let listing) = model.mealLibrary {
            let matches = listing.meals.filter {
                query.isEmpty || $0.title.localizedCaseInsensitiveContains(query.trimmingCharacters(in: .whitespaces))
            }
            if listing.meals.isEmpty && query.isEmpty {
                Text("Type what you’re having. Meals you save show up here to pick next time.")
                    .font(.footnote).foregroundStyle(NestColor.ink3).padding(.horizontal, 4)
            }
            if !matches.isEmpty {
                Text(query.isEmpty ? "Your saved meals" : "From your saved meals")
                    .font(.footnote.weight(.semibold)).foregroundStyle(NestColor.ink2).padding(.top, 4)
                VStack(spacing: 0) {
                    ForEach(Array(matches.enumerated()), id: \.element.id) { index, meal in
                        if index > 0 { NestRowDivider(leading: 70) }
                        savedRow(meal)
                    }
                }
                .nestCard(padding: 0, radius: 20)
            }
            recipeProblem
            if listing.nextAfterId != nil {
                Button(loadingMore ? "Loading…" : "Load more saved meals") {
                    loadingMore = true
                    Task {
                        await model.loadNextMealLibraryPage()
                        loadingMore = false
                    }
                }
                .buttonStyle(NestButtonStyle(kind: .plain, small: true))
                .disabled(loadingMore)
            }
        } else if case .loading = model.mealLibrary {
            ProgressView().frame(maxWidth: .infinity)
        }
    }

    private func savedRow(_ meal: SavedMealSummary) -> some View {
        Button {
            editingTitle = false
            useSaved = true
            selectedId = meal.id
            Task { await model.loadSavedRecipe(meal.id) }
        } label: {
            HStack(spacing: 12) {
                EmojiTile(emoji: MealEmoji.emoji(for: meal.title), size: 42)
                VStack(alignment: .leading, spacing: 2) {
                    Text(meal.title).foregroundStyle(NestColor.ink)
                    if let servings = meal.servings {
                        Text("Serves \(servings)").font(.footnote).foregroundStyle(NestColor.ink2)
                    }
                }
                Spacer()
                if useSaved && selectedId == meal.id { selectionMark(meal.id) }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .contentShape(Rectangle())
        }
        .buttonStyle(NestPressStyle())
        .accessibilityValue(useSaved && selectedId == meal.id ? "Selected" : "")
    }

    @ViewBuilder
    private func selectionMark(_ id: UUID) -> some View {
        switch model.savedRecipe {
        case .loading: ProgressView()
        case .loaded(let recipe) where recipe.id == id:
            Image(systemName: "checkmark").foregroundStyle(NestColor.accentInk)
        default: Image(systemName: "exclamationmark.circle").foregroundStyle(NestColor.warn)
        }
    }

    /// The selected recipe couldn't be read, so Save stays off; say why and offer a way back.
    @ViewBuilder
    private var recipeProblem: some View {
        if useSaved, let selectedId {
            switch model.savedRecipe {
            case .missing:
                TodayForYouRetry(text: "This meal is no longer saved.") {
                    self.selectedId = nil
                    Task { await model.refreshMealLibrary() }
                }
            case .failed, .idle:
                TodayForYouRetry(text: "Couldn’t load this meal.") {
                    Task { await model.loadSavedRecipe(selectedId) }
                }
            default: EmptyView()
            }
        }
    }

    private func submit() {
        editingTitle = false
        saving = true
        Task {
            if await save() {
                dismiss()
            } else {
                errorText = model.mealNotice ?? "Couldn’t save this meal. Try again."
                saving = false
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
