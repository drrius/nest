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

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.decision.correction)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this correction." : "You chose to decline this correction.")
                    if let result = saved.result, [.consumed, .denied].contains(result.approval.status) {
                        outcome(result.approval)
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text("Not confirmed yet. Check the saved decision before reviewing another correction.")
                        Button("Check and retry") { Task { await retry() } }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.correction)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and split above are correct.")
                                Button("Approve correction") { choice = true }
                                Button("Decline correction", role: .destructive) { choice = false }
                            } else {
                                Text("This approval has expired. Ask for a new proposal.")
                            }
                        }
                    } else {
                        outcome(approval)
                    }
                }
            }
            Button("Refresh approval") { Task { await load() } }
        }
        .disabled(working)
        .navigationTitle("Review correction")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .confirmationDialog(
            choice == true ? "Apply this correction?" : "Decline this correction?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Approve and record" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact correction you reviewed. Nest does not transfer money.")
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
            NavigationLink("Review original entry") {
                MoneyDetailScreen(session: session, member: member, eventId: correction.sourceEventId)
            }
        }
        switch correction.replacement {
        case .expense(let expense):
            ExpenseReviewSection(expense: expense, member: member, members: [], categoryName: nil)
        case .opening(let opening):
            Section("Replacement opening balance") {
                Text(opening.description)
                LabeledContent("Amount", value: opening.amountCentimes.absoluteCHF)
                LabeledContent("Owed to", value: opening.payerId == member.userId ? "You" : "Your partner")
                LabeledContent("Date", value: opening.date.value)
                if let note = opening.note { Text(note) }
            }
        case nil: EmptyView()
        }
    }

    @ViewBuilder
    private func outcome(_ approval: CorrectionApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Correction recorded.")
            NavigationLink("View recorded correction") {
                MoneyDetailScreen(
                    session: session, member: member, eventId: receipt.replacementEventId ?? receipt.reversalEventId)
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
        }
    }
    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now), original?.event.id == approval.correction.sourceEventId
        else { return }
        await perform {
            try await session.stageCorrectionDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    correction: approval.correction, approved: approved), context: context)
            saved = try await session.savedCorrectionDecision(context)
            saved = try await session.retryCorrectionDecision(context)
        }
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
