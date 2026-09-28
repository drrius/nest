import SwiftUI

struct CookingPreferencesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var context: CookingEditContext?
    @State private var notes = ""
    @State private var slots = Set(MealSlot.allCases)
    @State private var loading = false
    @State private var submitting = false

    var body: some View {
        Form {
            if let pending = model.cookingPending {
                Section("Saved change") {
                    Text(pending.command.preferences.mealSlots.map(\.label).joined(separator: ", "))
                    Text(pending.command.preferences.cookingNotes).font(.subheadline)
                    switch pending.state {
                    case .pending:
                        Text("Waiting for confirmation. Retry this saved request when connected.")
                        Button("Retry save") { Task { await model.retryCookingPreferences() } }
                    case .acknowledged:
                        Text("Saved. Refresh to see the confirmed household preferences.")
                        Button("Refresh") { Task { await reload() } }
                    case .conflict:
                        Text(
                            "Someone changed these preferences. Discard this rejected change and review the current settings."
                        )
                        Button("Discard rejected change") {
                            Task {
                                await model.discardCookingConflict()
                                await reload()
                            }
                        }
                    }
                }.disabled(model.cookingSaving || loading)
            }
            Section("Show in your week") {
                ForEach(MealSlot.allCases, id: \.self) { slot in
                    Toggle(
                        slot.label,
                        isOn: Binding(
                            get: { slots.contains(slot) },
                            set: { enabled in
                                if enabled { slots.insert(slot) } else { slots.remove(slot) }
                            }))
                }
                Text("Already-planned meals stay visible even when their slot is hidden.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }.disabled(!editable)
            Section("Cooking notes") {
                TextField("What helps you cook?", text: $notes, axis: .vertical).lineLimit(3...8)
                Text("Shared with your household and used for meal planning.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }.disabled(!editable)
            if slots.isEmpty { Text("Keep at least one meal slot.") }
            if notes.utf16.count > 2_000 { Text("Keep cooking notes under 2,000 characters.") }
            if let notice = model.cookingNotice { Text(notice).foregroundStyle(QuietPalette.muted) }
            if loading { ProgressView("Loading preferences…") }
            if context == nil && !loading {
                Button("Load current preferences") { Task { await reload() } }
            }
        }
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .navigationTitle("Cooking preferences")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(submitting ? "Saving…" : "Save") { Task { await save() } }
                    .disabled(!editable || !valid)
            }
        }
        .task { await reload() }
    }

    private var editable: Bool {
        context != nil && !loading && !submitting && !model.cookingSaving && model.cookingPending == nil
    }

    private var valid: Bool {
        guard let context else { return false }
        return
            (try? SaveCookingProfile(
                operationId: UUID(), expectedRevision: context.profile.profile?.revision ?? "0",
                notes: notes, slots: MealSlot.allCases.filter { slots.contains($0) })) != nil
    }

    private func reload() async {
        guard !loading else { return }
        loading = true
        defer { loading = false }
        context = await model.loadCookingPreferences()
        if let profile = context?.profile {
            notes = profile.profile?.preferences.cookingNotes ?? ""
            slots = Set(profile.profile?.preferences.mealSlots ?? MealSlot.allCases)
        }
    }

    private func save() async {
        guard editable, valid, let context else { return }
        submitting = true
        defer { submitting = false }
        if await model.saveCookingPreferences(
            context, notes: notes, slots: MealSlot.allCases.filter { slots.contains($0) })
        {
            await reload()
        }
    }
}
