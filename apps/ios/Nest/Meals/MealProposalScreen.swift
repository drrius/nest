import SwiftUI

struct MealProposalScreen: View {
    @ObservedObject var model: SessionModel
    let week: MealWeekSnapshot
    @State private var context: ProposalContext?
    @State private var familiarOnly = false
    @State private var busy = false
    @State private var notice: String?
    @State private var confirming = false

    var body: some View {
        List {
            Section {
                Text("A little help with the week.").font(.title2.weight(.semibold))
                Text("Suggestions stay private until you approve them. Ingredients are reviewed separately.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if let context, model.generation == context.generation, model.status == .ready(context.member) {
                content(context)
            }
            if let notice { Section { Text(notice).foregroundStyle(QuietPalette.muted) } }
            if busy { ProgressView("Checking your plan…") }
        }
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .tint(QuietPalette.accent)
        .navigationTitle("Plan meals")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: model.generation) { await perform(.load) }
        .confirmationDialog("Save these meals to your household week?", isPresented: $confirming) {
            Button("Approve and save meals") { Task { await perform(.approve) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Only the meals you reviewed will be saved. Nothing is added to groceries.")
        }
    }

    @ViewBuilder private func content(_ context: ProposalContext) -> some View {
        if let saved = context.saved {
            Section("Week of \(MealWeekScreen.label(saved.command.weekStart.date))") {
                if let proposal = saved.envelope?.proposal {
                    Text(statusLabel(proposal.status)).font(.headline)
                    if let entries = proposal.entries {
                        ForEach(entries, id: \.id) { entry in
                            NavigationLink {
                                ProposalRecipeScreen(entry: entry)
                            } label: {
                                ProposalMealRow(entry: entry)
                            }
                        }
                    }
                    actions(context, proposal: proposal)
                } else {
                    Text("Your request is saved. Continue with the same request when connected.")
                    Button("Continue planning") { Task { await perform(.generate) } }
                }
            }.disabled(busy)
        } else {
            Section("Week of \(MealWeekScreen.label(week.weekStart.date))") {
                Toggle("Use saved meals only", isOn: $familiarOnly)
                Button("Suggest a plan") { Task { await perform(.generate) } }
            }.disabled(busy)
        }
    }

    @ViewBuilder private func actions(_ context: ProposalContext, proposal: MealProposal) -> some View {
        if let approval = context.approval {
            switch approval.state {
            case .pending, .acknowledged:
                Text("Your approval is saved. Check its result before making another change.")
                Button("Check approval") { Task { await perform(.retryApproval) } }
            case .conflict:
                Text("This approval was rejected. Review the current plan before approving again.")
                Button("Clear rejected approval") { Task { await perform(.clearConflict) } }
            }
        } else if proposal.status == .ready {
            Button("Approve plan") { confirming = true }
                .disabled(Double(proposal.expiresAt) <= Date.now.timeIntervalSince1970 * 1000)
        } else if proposal.status == .generating {
            Button("Continue planning") { Task { await perform(.generate) } }
        } else if proposal.status == .failed {
            Text("A plan could not be prepared. Your household week has not changed.")
        } else if proposal.status == .approved {
            Text("Meals saved. Review ingredients from the Meals screen when you’re ready.")
        }
        Button("Refresh plan") { Task { await perform(.refresh) } }
    }

    private enum Action { case load, generate, refresh, approve, retryApproval, clearConflict }

    private func perform(_ action: Action) async {
        guard !busy else { return }
        busy = true
        notice = nil
        let attempt = model.generation
        defer { busy = false }
        do {
            let current = try await model.cachedProposalContext()
            try await execute(action, current: current)
        } catch {
            guard model.generation == attempt else {
                context = nil
                return
            }
            context = try? await model.cachedProposalContext()
            notice = "Could not finish this step. Your saved request is kept; reconnect and try again."
        }
    }

    private func execute(_ action: Action, current: ProposalContext) async throws {
        switch action {
        case .load: context = current
        case .generate:
            if current.saved == nil {
                try await model.stageProposalGeneration(week: week, familiarOnly: familiarOnly, context: current)
            }
            context = try await model.retryProposalGeneration(current)
        case .refresh: context = try await model.refreshProposalContext(current)
        case .approve:
            guard let reviewed = context else { throw OfflineFailure.missingSnapshot }
            try await model.stageProposalApproval(reviewed)
            context = try await model.retryProposalApproval(reviewed)
            await model.refreshMealWeek()
        case .retryApproval:
            context = try await model.retryProposalApproval(current)
            await model.refreshMealWeek()
        case .clearConflict:
            context = try await model.discardProposalApprovalConflict(current)
            context = try await model.refreshProposalContext(current)
        }
    }

    private func statusLabel(_ status: MealProposal.Status) -> String {
        switch status {
        case .generating: "Preparing your plan"
        case .ready: "Your suggested meals"
        case .failed: "Planning unavailable"
        case .approved: "Plan saved"
        case .discarded: "Plan discarded"
        }
    }
}

private struct ProposalMealRow: View {
    let entry: ProposedMeal
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(MealWeekScreen.label(entry.date)) · \(entry.slot.rawValue.capitalized)")
                .font(.caption).foregroundStyle(QuietPalette.muted)
            Text(title).font(.headline)
            if let calories = entry.estimatedCaloriesPerServing {
                Text("About \(calories) kcal per serving").font(.caption).foregroundStyle(QuietPalette.muted)
            }
        }.padding(.vertical, 6)
    }
    private var title: String {
        switch entry.source {
        case .saved(_, let recipe): recipe.title
        case .suggested(let recipe): recipe.title
        }
    }
}
