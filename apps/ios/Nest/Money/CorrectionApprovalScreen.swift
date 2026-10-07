import SwiftUI

struct CorrectionApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let approvalId: UUID
    @State private var context: ExpenseContext?
    @State private var envelope: CorrectionApprovalEnvelope?
    @State private var original: MoneyDetail?
    @State private var saved: SavedCorrectionDecision?
    @State private var working = false
    @State private var notice: String?
    @State private var choice: Bool?
    @State private var categoryName: String?
    @State private var categoryNotice: String?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let categoryNotice { Section { Text(categoryNotice) } }
            if let saved {
                summary(saved.decision.correction)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this correction." : "You chose to decline this correction.")
                    if saved.expiry?.expiredUnused == true {
                        Text(
                            "This approval expired without recording a change. Ask for a new proposal if still needed.")
                        Button {
                            Task { await finish() }
                        } label: {
                            QuietActionLabel("Done")
                        }
                    } else if let result = saved.result, [.consumed, .denied].contains(result.approval.status) {
                        outcome(result.approval)
                        Button {
                            Task { await finish() }
                        } label: {
                            QuietActionLabel("Done")
                        }
                    } else {
                        Text("Not confirmed yet. Check the saved decision before reviewing another correction.")
                        Button {
                            Task { await retry() }
                        } label: {
                            QuietActionLabel("Check and retry")
                        }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.correction)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and split above are correct.")
                                Button {
                                    choice = true
                                } label: {
                                    QuietActionLabel("Approve correction")
                                }
                                .disabled(categoryId(approval.correction) != nil && categoryName == nil)
                                Button(role: .destructive) {
                                    choice = false
                                } label: {
                                    QuietActionLabel("Decline correction")
                                }
                            } else {
                                Text("This approval has expired. Ask for a new proposal.")
                            }
                        }.buttonStyle(.borderless)
                    } else {
                        outcome(approval)
                    }
                }
            }
            Button {
                Task { await load() }
            } label: {
                QuietActionLabel("Refresh approval")
            }
        }
        .disabled(working)
        .navigationTitle("Review correction")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .alert(
            choice == true ? "Correct entry?" : "Decline correction?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Apply" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text("History stays. No transfer.")
        }
    }

    @ViewBuilder
    private func summary(_ correction: CorrectionInput) -> some View {
        if let original, original.event.id == correction.sourceEventId {
            ApprovalOriginalEntry(detail: original, member: member)
        }
        Section("Proposed correction") {
            Text(correction.replacement == nil ? "Undo the original entry" : "Replace the original entry")
                .font(.headline)
            Text("The original remains in financial history. A reversal cancels its effect on your balance.")
            NavigationLink {
                MoneyDetailScreen(session: session, member: member, eventId: correction.sourceEventId)
            } label: {
                QuietActionLabel("Review original entry")
            }
        }
        switch correction.replacement {
        case .expense(let expense):
            ExpenseReviewSection(
                expense: expense, member: member, members: [], categoryName: categoryName,
                unknownCategoryLabel: "Could not confirm category")
        case .opening(let opening):
            Section("Replacement opening balance") {
                Text(opening.description)
                QuietValueRow("Amount", value: opening.amountCentimes.absoluteCHF)
                QuietValueRow("Owed to", value: opening.payerId == member.userId ? "You" : "Your partner")
                QuietValueRow("Date", value: opening.date.value)
                if let note = opening.note { Text(note) }
            }
        case nil: EmptyView()
        }
    }

    @ViewBuilder
    private func outcome(_ approval: CorrectionApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Correction recorded.")
            NavigationLink {
                MoneyDetailScreen(
                    session: session, member: member, eventId: receipt.replacementEventId ?? receipt.reversalEventId)
            } label: {
                QuietActionLabel("View recorded correction")
            }
        } else if approval.status == .denied {
            Text("Correction declined. No correction was recorded by this approval.")
        } else {
            Text("This approval is awaiting its recorded result. Refresh to check again.")
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            categoryName = nil
            categoryNotice = nil
            saved = try await session.savedCorrectionDecision(current)
            envelope = nil
            original = nil
            if saved == nil {
                let proposal = try await session.readCorrectionApproval(current, approvalId: approvalId)
                original = try await session.readMoneyDetail(
                    member: member, generation: current.generation,
                    eventId: proposal.approval.correction.sourceEventId)
                envelope = proposal
            }
            if let correction = saved?.decision.correction ?? envelope?.approval.correction,
                let id = categoryId(correction)
            {
                do {
                    categoryName = try await session.readMoneyCategory(current, categoryId: id).category?.name
                } catch {
                    try session.requireMoneyAccount(current.member, generation: current.generation)
                }
                if categoryName == nil {
                    categoryNotice =
                        "Could not confirm the replacement category. Refresh before approving. You can still decline."
                }
            }
        }
    }
    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now), original?.event.id == approval.correction.sourceEventId
        else { return }
        guard !approved || categoryId(approval.correction) == nil || categoryName != nil else { return }
        await perform {
            try await session.stageCorrectionDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    correction: approval.correction, approved: approved), context: context)
            saved = try await session.savedCorrectionDecision(context)
            saved = try await session.retryCorrectionDecision(context)
        }
    }
    private func categoryId(_ correction: CorrectionInput) -> UUID? {
        if case .expense(let expense) = correction.replacement { return expense.categoryId }
        return nil
    }
    private func retry() async {
        guard let context else { return }
        await perform { saved = try await session.retryCorrectionDecision(context) }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishCorrectionDecision(context, approvalId: saved.decision.approvalId)
            self.saved = nil
            dismiss()
        }
    }
    private func perform(_ work: () async throws -> Void) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            try await work()
            notice = nil
        } catch {
            if let context { saved = try? await session.savedCorrectionDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
