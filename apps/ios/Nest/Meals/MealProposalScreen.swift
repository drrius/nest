import SwiftUI

struct MealProposalScreen: View {
    @ObservedObject var model: SessionModel
    let week: MealWeekSnapshot
    @State private var context: ProposalContext?
    @State private var familiarOnly = false
    @State private var busy = false
    @State private var notice: String?
    @State private var confirming = false
    @State private var editing: ProposedMeal?

    @State private var revealed = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                ProposalHeader(stage: stage)
                if let context, model.generation == context.generation, model.status == .ready(context.member) {
                    content(context)
                } else if busy {
                    ProposalThinkingRows()
                }
                if let notice {
                    Label(notice, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(NestColor.warn)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
            .padding(.bottom, 120)
            .disabled(busy)
        }
        .nestScreen()
        .tint(NestColor.accent)
        .navigationTitle("")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await perform(.refresh) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .accessibilityLabel("Refresh plan")
                .disabled(busy || context?.saved == nil)
            }
        }
        .safeAreaInset(edge: .bottom) { bottomBar }
        .sheet(item: $editing) { entry in
            if let context {
                ProposalMealEditSheet(model: model, context: context, entry: entry) { self.context = $0 }
            }
        }
        .task(id: model.generation) { await perform(.load) }
        .onChange(of: entryCount) { _, count in Task { await reveal(count) } }
        .confirmationDialog("Save these meals to your household week?", isPresented: $confirming) {
            Button("Approve and save meals") { Task { await perform(.approve) } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Only the meals you reviewed will be saved. Nothing is added to groceries.")
        }
    }

    private var proposal: MealProposal? { context?.saved?.envelope?.proposal }
    private var entryCount: Int { proposal?.entries?.count ?? 0 }

    private var stage: ProposalStage {
        guard let saved = context?.saved else { return busy ? .thinking : .ask }
        guard let proposal = saved.envelope?.proposal else { return saved.rejected == true ? .failed : .thinking }
        switch proposal.status {
        case .generating: return .thinking
        case .ready: return .draft
        case .approved: return .saved
        case .failed: return .failed
        case .discarded: return .discarded
        }
    }

    @ViewBuilder private func content(_ context: ProposalContext) -> some View {
        if let saved = context.saved {
            if let proposal = saved.envelope?.proposal {
                if let entries = proposal.entries {
                    ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                        if index < revealed || reduceMotion {
                            ProposalMealRow(
                                entry: entry,
                                canSwap: proposal.status == .ready && context.edit == nil && context.approval == nil
                                    && context.discard == nil,
                                swap: { editing = entry }
                            )
                            .transition(
                                .asymmetric(
                                    insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
                        }
                    }
                } else if proposal.status == .generating {
                    ProposalThinkingRows()
                }
                VStack(alignment: .leading, spacing: 10) {
                    if context.edit != nil {
                        ProposalEditRecovery(model: model, context: context, busy: busy) { self.context = $0 }
                    } else if context.discard == nil {
                        statusNotes(context, proposal: proposal)
                    }
                    ProposalDiscardControls(model: model, context: context, busy: busy) { self.context = $0 }
                }
                .font(.subheadline)
            } else if saved.rejected == true {
                Text("Planning couldn’t start. Check food and cooking setup, then try again.")
                    .foregroundStyle(NestColor.ink2)
                Button("Clear rejected request") { Task { await perform(.clearGeneration) } }
                    .buttonStyle(NestButtonStyle(kind: .secondary))
            } else {
                ProposalThinkingRows()
                Button("Continue planning") { Task { await perform(.generate) } }
                    .buttonStyle(NestButtonStyle(kind: .secondary))
            }
        } else {
            askCard
        }
    }

    private var askCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            Picker("Suggestions", selection: $familiarOnly) {
                Text("A few new ideas").tag(false)
                Text("Saved meals only").tag(true)
            }
            .segmentedUnlessLarge(textSize.isAccessibilitySize)
            VStack(spacing: 0) {
                NavigationLink {
                    FoodPreferencesScreen(model: model).id(model.generation)
                } label: {
                    TodayForYouRow(
                        icon: "checkmark.shield", domain: .house, title: "Your food preferences",
                        detail: "What you each avoid is respected. Private notes stay private.")
                }
                .buttonStyle(NestPressStyle())
                NestRowDivider(leading: 64)
                NavigationLink {
                    CookingPreferencesScreen(model: model).id(model.generation)
                } label: {
                    TodayForYouRow(
                        icon: "frying.pan", domain: .meal, title: "Household cooking preferences",
                        detail: "Meal slots, effort and notes for you both")
                }
                .buttonStyle(NestPressStyle())
            }
            .nestCard(padding: 0)
            Text("Each of you needs to save food preferences before planning can start.")
                .font(.footnote).foregroundStyle(NestColor.ink3)
        }
    }

    @ViewBuilder private var bottomBar: some View {
        if stage == .ask, context != nil {
            Button {
                Task { await perform(.generate) }
            } label: {
                Label("Suggest a week", systemImage: "sparkles")
            }
            .buttonStyle(NestButtonStyle(kind: .primary, fullWidth: true))
            .disabled(busy)
            .padding(.horizontal, 20).padding(.bottom, 8)
        } else if let proposal, proposal.status == .ready, context?.approval == nil, context?.edit == nil,
            context?.discard == nil
        {
            Button {
                confirming = true
            } label: {
                Label("Save to the week", systemImage: "checkmark")
            }
            .buttonStyle(NestButtonStyle(kind: .primary, fullWidth: true))
            .disabled(busy || Double(proposal.expiresAt) <= Date.now.timeIntervalSince1970 * 1000)
            .accessibilityLabel("Approve plan")
            .padding(.horizontal, 20).padding(.bottom, 8)
        }
    }

    @ViewBuilder private func statusNotes(_ context: ProposalContext, proposal: MealProposal) -> some View {
        if let approval = context.approval {
            switch approval.state {
            case .pending, .acknowledged:
                Text("Your approval is saved. Check its result before making another change.")
                Button("Check approval") { Task { await perform(.retryApproval) } }
            case .conflict:
                Text("This approval was rejected. Review the current plan before approving again.")
                Button("Clear rejected approval") { Task { await perform(.clearConflict) } }
            }
        } else if proposal.status == .generating {
            Button("Continue planning") { Task { await perform(.generate) } }
                .buttonStyle(NestButtonStyle(kind: .secondary))
        } else if proposal.status == .approved {
            Text("Meals saved. Review ingredients from Meals when you’re ready.").foregroundStyle(NestColor.ink2)
        }
    }

    private func reveal(_ count: Int) async {
        guard !reduceMotion else {
            revealed = count
            return
        }
        while revealed < count {
            try? await Task.sleep(for: .milliseconds(revealed == 0 ? 150 : 110))
            withAnimation(.spring(response: 0.45, dampingFraction: 0.8)) { revealed += 1 }
        }
        if revealed > count { revealed = count }
    }

    private enum Action { case load, generate, refresh, approve, retryApproval, clearConflict, clearGeneration }

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
        case .clearGeneration: context = try await model.clearRejectedGeneration(current)
        case .generate: try await generate(current)
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

    private func generate(_ current: ProposalContext) async throws {
        if current.saved == nil {
            let fresh = try await model.freshProposalWeek(week.weekStart, context: current)
            try await model.stageProposalGeneration(week: fresh, familiarOnly: familiarOnly, context: current)
        }
        context = try await model.retryProposalGeneration(current)
    }

}
