import SwiftUI

struct FoodPreferencesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var context: FoodEditContext?
    @State private var preferences = FoodPreferences(restrictions: [], dislikes: [], calorieGoal: nil, portions: 1)
    @State private var calorieGoal = ""
    @State private var busy = false
    @State private var notice: String?
    @State private var discard = false
    @State private var reload = false
    @State private var request = UUID()

    var body: some View {
        Form {
            Section {
                Text(
                    "Your dietary preferences help plan household meals. Your calorie goal stays out of your partner’s profile and chat."
                )
                .foregroundStyle(QuietPalette.muted)
            }
            if let context, model.generation == context.generation, model.status == .ready(context.member) {
                if let pending = context.pending { recovery(pending) }
                FoodPreferenceFields(preferences: $preferences, calorieGoal: $calorieGoal).disabled(!editable)
                if editable && draft == nil {
                    Text(
                        "Fill or remove empty rows, keep each entry under 120 characters, and use a calorie goal from 1 to 20,000 or leave it blank."
                    )
                    .font(.footnote)
                }
            }
            if let notice { Text(notice).foregroundStyle(QuietPalette.muted) }
            if busy { ProgressView("Checking preferences…") }
            if !busy && context?.profile == nil {
                Button("Load preferences") { Task { await load() } }
            }
            if !busy && context?.profile != nil && context?.pending == nil {
                Button("Reload current preferences") { reload = true }
            }
        }
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .tint(QuietPalette.accent)
        .navigationTitle("Your food preferences")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") { Task { await save() } }.disabled(!editable || draft == nil)
            }
        }
        .task(id: model.generation) { await load() }
        .confirmationDialog("Discard rejected preferences?", isPresented: $discard) {
            Button("Discard request", role: .destructive) { Task { await recover() } }
            Button("Cancel", role: .cancel) {}
        }
        .confirmationDialog("Reload and discard unsaved edits?", isPresented: $reload) {
            Button("Reload preferences", role: .destructive) { Task { await load() } }
            Button("Cancel", role: .cancel) {}
        }
    }

    @ViewBuilder private func recovery(_ pending: SavedFoodPreference) -> some View {
        Section("Saved change") {
            switch pending.state {
            case .pending:
                Text("This save is stored on this iPhone. Retry the same request when connected.")
                Button("Retry save") { Task { await retry() } }
            case .acknowledged:
                Text("Saved. Refresh to confirm your current preferences.")
                Button("Refresh") { Task { await retry() } }
            case .conflict:
                Text(
                    "These preferences changed or the save was rejected. Discard this request, then review the current values."
                )
                Button("Discard rejected request") { discard = true }
            }
        }.disabled(busy)
    }

    private var editable: Bool {
        guard let context else { return false }
        return !busy && context.profile != nil && context.pending == nil
            && model.generation == context.generation && model.status == .ready(context.member)
    }

    private var draft: FoodPreferences? {
        var result = preferences
        if calorieGoal.isEmpty {
            result.calorieGoal = nil
        } else {
            guard calorieGoal.allSatisfy({ $0.isASCII && $0.isNumber }), let goal = Int(calorieGoal) else { return nil }
            result.calorieGoal = goal
        }
        return try? result.validated()
    }

    private func apply(_ value: FoodEditContext) throws {
        try model.requireFoodContext(value)
        context = value
        preferences =
            value.pending?.command.preferences ?? value.profile?.profile?.preferences
            ?? FoodPreferences(restrictions: [], dislikes: [], calorieGoal: nil, portions: 1)
        calorieGoal = preferences.calorieGoal.map(String.init) ?? ""
    }

    private func load() async {
        let id = UUID()
        request = id
        busy = true
        context = nil
        notice = nil
        defer { if request == id { busy = false } }
        do {
            let cached = try await model.cachedFoodContext()
            guard request == id else { return }
            try apply(cached)
            let fresh = try await model.refreshFoodContext(cached)
            guard request == id else { return }
            try apply(fresh)
        } catch { if request == id { notice = "Could not refresh. Saved values and requests remain on this iPhone." } }
    }

    private func save() async {
        guard let context, let draft, editable else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.stageFoodPreferences(draft, context: context)
            try apply(try await model.retryFoodPreferences(context))
            notice = "Saved. These are your current food preferences."
        } catch { await showRecovery() }
    }

    private func retry() async {
        guard let context else { return }
        busy = true
        defer { busy = false }
        do {
            try apply(try await model.retryFoodPreferences(context))
            notice = "Saved. These are your current food preferences."
        } catch { await showRecovery() }
    }

    private func showRecovery() async {
        guard let original = context else { return }
        if let cached = try? await model.cachedFoodContext(),
            cached.generation == original.generation, cached.member == original.member
        {
            if cached.pending != nil {
                try? apply(cached)
                notice = "Could not confirm the save. Review the saved request before retrying."
                return
            }
        }
        notice =
            "Could not confirm the save. Connect and reload current preferences before trying again. Your edits are still here."
    }

    private func recover() async {
        guard let context else { return }
        busy = true
        defer { busy = false }
        do {
            try await model.discardFoodConflict(context)
            await load()
        } catch {
            notice = "Could not discard this rejected request. Try again."
        }
    }
}
