import SwiftUI

struct SettlementApprovalScreen: View {
    @Environment(\.dismiss) private var dismiss
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
                QuietFormSection("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this settlement." : "You chose to decline this settlement.")
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
                        Text("Not confirmed yet. Check the saved decision before reviewing another settlement.")
                        Button {
                            Task { await retry() }
                        } label: {
                            QuietActionLabel("Check and retry")
                        }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.settlement)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and recipient above are correct.")
                                Button {
                                    choice = true
                                } label: {
                                    QuietActionLabel("Approve payment")
                                }
                                Button(role: .destructive) {
                                    choice = false
                                } label: {
                                    QuietActionLabel("Decline payment")
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
        .navigationTitle("Review payment")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .alert(
            choice == true ? "Record payment?" : "Decline payment?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Record" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
            Button("Cancel", role: .cancel) { choice = nil }
        } message: {
            Text("No money is transferred.")
        }
    }

    private func summary(_ settlement: SettlementInput) -> some View {
        QuietFormSection("Payment to record") {
            Text(settlement.description).font(.headline)
            Text("Confirm a payment that already happened. Nest does not transfer money.")
                .foregroundStyle(QuietPalette.muted)
            QuietValueRow("Amount", value: settlement.amountCentimes.absoluteCHF)
            QuietValueRow("Paid by", value: settlement.payerId == member.userId ? "You" : "Your partner")
            QuietValueRow("Received by", value: settlement.recipientId == member.userId ? "You" : "Your partner")
            QuietValueRow("Date", value: settlement.date.value)
            QuietValueRow("Reviewed balance", value: settlement.expectedOutstandingCentimes.absoluteCHF)
            QuietValueRow("Payment", value: settlement.mode == .full ? "Full balance" : "Partial balance")
            if let note = settlement.note { Text(note) }
        }
    }

    @ViewBuilder
    private func outcome(_ approval: SettlementApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Payment recorded.")
            NavigationLink {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            } label: {
                QuietActionLabel("View recorded settlement")
            }
        } else if approval.status == .denied {
            Text("Payment declined. No payment was recorded by this approval.")
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
            if let context { saved = try? await session.savedSettlementDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
