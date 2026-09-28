import SwiftUI

struct ProposalMealEditSheet: View {
    @ObservedObject var model: SessionModel
    let context: ProposalContext
    let entry: ProposedMeal
    let updated: (ProposalContext) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var busy = false
    @State private var notice: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("\(MealWeekScreen.label(entry.date)) · \(entry.slot.label)").font(.headline)
                    Text("Only this suggestion changes. Review the updated plan before approving it.")
                        .foregroundStyle(QuietPalette.muted)
                    Button("Suggest another meal") { Task { await change(recipe: nil, revision: nil) } }
                }
                Section("Choose a saved meal") { library }
                if let notice { Text(notice).foregroundStyle(QuietPalette.muted) }
                if busy { ProgressView("Updating suggestion…") }
            }
            .disabled(busy)
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Change suggestion")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(busy) } }
            .task { await model.refreshMealLibrary() }
            .interactiveDismissDisabled(busy)
        }.tint(QuietPalette.accent)
    }

    @ViewBuilder private var library: some View {
        switch model.mealLibrary {
        case .idle, .loading: ProgressView("Loading saved meals…")
        case .failed: Button("Try again") { Task { await model.refreshMealLibrary() } }
        case .loaded(let listing):
            if listing.meals.isEmpty { Text("No saved meals yet.").foregroundStyle(QuietPalette.muted) }
            ForEach(listing.meals) { meal in
                Button(meal.title) { Task { await change(recipe: meal.id, revision: listing.revision) } }
                    .frame(minHeight: 44)
            }
            if listing.nextAfterId != nil {
                Button("Load more") { Task { await model.loadNextMealLibraryPage() } }
            }
        }
    }

    private func change(recipe: UUID?, revision: String?) async {
        guard !busy, let proposal = context.saved?.envelope?.proposal else { return }
        busy = true
        defer { busy = false }
        do {
            let command = MealProposalEditCommand(
                action: recipe == nil ? .replace : .choose,
                operationId: UUID(), proposalId: proposal.id, expectedRevision: proposal.revision,
                entryId: entry.id, definitionId: recipe, expectedLibraryRevision: revision)
            try await model.stageProposalEdit(command, context: context)
            updated(try await model.retryProposalEdit(context))
            dismiss()
        } catch {
            guard model.generation == context.generation else {
                dismiss()
                return
            }
            if let cached = try? await model.cachedProposalContext() {
                updated(cached)
                if cached.edit != nil {
                    dismiss()
                    return
                }
            }
            notice = "Could not change this suggestion. Refresh the plan and try again."
        }
    }
}
