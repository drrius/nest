import SwiftUI

struct SettlementApprovalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let approvalId: UUID
    @State private var context: ExpenseContext?
    @State private var envelope: SettlementApprovalEnvelope?
    @State private var saved: SavedSettlementDecision?
    @State private var working = false
    @State private var notice: String?
    @State private var choice: Bool?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.decision.settlement)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this settlement." : "You chose to decline this settlement.")
                    if let result = saved.result, [.consumed, .denied].contains(result.approval.status) {
                        outcome(result.approval)
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text("Not confirmed yet. Check the saved decision before reviewing another settlement.")
                        Button("Check and retry") { Task { await retry() } }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.settlement)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and split above are correct.")
                                Button("Approve payment") { choice = true }
                                Button("Decline payment", role: .destructive) { choice = false }
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
        .navigationTitle("Review payment")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .confirmationDialog(
            choice == true ? "Record this payment?" : "Decline this payment?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Approve and record" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact settlement you reviewed. Nest does not transfer money.")
        }
    }

    private func summary(_ settlement: SettlementInput) -> some View {
        Section("Payment to record") {
            Text(settlement.description).font(.headline)
            Text("Confirm a payment that already happened. Nest does not transfer money.")
                .foregroundStyle(QuietPalette.muted)
            LabeledContent("Amount", value: settlement.amountCentimes.absoluteCHF)
            LabeledContent("Paid by", value: settlement.payerId == member.userId ? "You" : "Your partner")
            LabeledContent("Received by", value: settlement.recipientId == member.userId ? "You" : "Your partner")
            LabeledContent("Date", value: settlement.date.value)
            LabeledContent("Reviewed balance", value: settlement.expectedOutstandingCentimes.absoluteCHF)
            LabeledContent("Payment", value: settlement.mode == .full ? "Full balance" : "Partial balance")
            if let note = settlement.note { Text(note) }
        }
    }

    @ViewBuilder
    private func outcome(_ approval: SettlementApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Expense recorded.")
            NavigationLink("View recorded settlement") {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            }
        } else if approval.status == .denied {
            Text("Expense declined. No settlement was recorded by this approval.")
        } else {
            Text("This approval is awaiting its recorded result. Refresh to check again.")
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedSettlementDecision(current)
            envelope = nil
            if saved == nil { envelope = try await session.readSettlementApproval(current, approvalId: approvalId) }
        }
    }
    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now)
        else { return }
        await perform {
            try await session.stageSettlementDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    settlement: approval.settlement, approved: approved), context: context)
            saved = try await session.savedSettlementDecision(context)
            saved = try await session.retrySettlementDecision(context)
        }
    }
    private func retry() async {
        guard let context else { return }
        await perform { saved = try await session.retrySettlementDecision(context) }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishSettlementDecision(context, approvalId: saved.decision.approvalId)
            self.saved = nil
            envelope = try await session.readSettlementApproval(context, approvalId: approvalId)
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
            if let context { saved = try? await session.savedSettlementDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
