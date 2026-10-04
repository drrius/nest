import SwiftUI

struct ExpenseApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let approvalId: UUID
    @State private var context: ExpenseContext?
    @State private var envelope: ExpenseApprovalEnvelope?
    @State private var saved: SavedExpenseDecision?
    @State private var working = false
    @State private var notice: String?
    @State private var choice: Bool?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                ExpenseReviewSection(expense: saved.decision.expense, member: member, members: [], categoryName: nil)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this expense." : "You chose to decline this expense.")
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
                        Text("Not confirmed yet. Check the saved decision before reviewing another expense.")
                        Button {
                            Task { await retry() }
                        } label: {
                            QuietActionLabel("Check and retry")
                        }
                    }
                }
            } else if let approval = envelope?.approval {
                ExpenseReviewSection(expense: approval.expense, member: member, members: [], categoryName: nil)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and split above are correct.")
                                Button {
                                    choice = true
                                } label: {
                                    QuietActionLabel("Approve expense")
                                }
                                Button(role: .destructive) {
                                    choice = false
                                } label: {
                                    QuietActionLabel("Decline expense")
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
        .navigationTitle("Review expense")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .alert(
            choice == true ? "Record this expense?" : "Decline this expense?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Approve and record" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text("This applies only to the exact expense you reviewed. Nest does not transfer money.")
        }
    }

    @ViewBuilder
    private func outcome(_ approval: ExpenseApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Expense recorded.")
            NavigationLink {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            } label: {
                QuietActionLabel("View recorded expense")
            }
        } else if approval.status == .denied {
            Text("Expense declined. No expense was recorded by this approval.")
        } else {
            Text("This approval is awaiting its recorded result. Refresh to check again.")
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedExpenseDecision(current)
            envelope = nil
            if saved == nil { envelope = try await session.readExpenseApproval(current, approvalId: approvalId) }
        }
    }
    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now)
        else { return }
        await perform {
            try await session.stageExpenseDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    expense: approval.expense, approved: approved), context: context)
            saved = try await session.savedExpenseDecision(context)
            saved = try await session.retryExpenseDecision(context)
        }
    }
    private func retry() async {
        guard let context else { return }
        await perform { saved = try await session.retryExpenseDecision(context) }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishExpenseDecision(context, approvalId: saved.decision.approvalId)
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
            if let context { saved = try? await session.savedExpenseDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
