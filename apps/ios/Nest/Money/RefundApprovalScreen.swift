import SwiftUI

struct RefundApprovalScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let approvalId: UUID
    @State private var context: ExpenseContext?
    @State private var envelope: RefundApprovalEnvelope?
    @State private var original: MoneyDetail?
    @State private var saved: SavedRefundDecision?
    @State private var working = false
    @State private var notice: String?
    @State private var choice: Bool?

    var body: some View {
        Form {
            if let notice { Section { Text(notice) } }
            if let saved {
                summary(saved.decision.refund)
                Section("Saved decision") {
                    Text(
                        saved.decision.approved
                            ? "You chose to approve this refund." : "You chose to decline this refund.")
                    if let result = saved.result, [.consumed, .denied].contains(result.approval.status) {
                        outcome(result.approval)
                        Button("Done") { Task { await finish() } }
                    } else {
                        Text("Not confirmed yet. Check the saved decision before reviewing another refund.")
                        Button("Check and retry") { Task { await retry() } }
                    }
                }
            } else if let approval = envelope?.approval {
                summary(approval.refund)
                Section {
                    if approval.status == .pending {
                        TimelineView(.periodic(from: .now, by: 1)) { clock in
                            if ApprovalTime.isOpen(approval.expiresAt, now: clock.date) {
                                Text("Only approve if the amount, payer and split above are correct.")
                                Button("Approve refund") { choice = true }
                                Button("Decline refund", role: .destructive) { choice = false }
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
        .navigationTitle("Review refund")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task { await load() }
        .confirmationDialog(
            choice == true ? "Record this refund?" : "Decline this refund?",
            isPresented: Binding(get: { choice != nil }, set: { if !$0 { choice = nil } })
        ) {
            if let choice {
                Button(choice ? "Approve and record" : "Decline", role: choice ? nil : .destructive) {
                    Task { await decide(choice) }
                }
            }
        } message: {
            Text("This applies only to the exact refund you reviewed. Nest does not transfer money.")
        }
    }

    @ViewBuilder
    private func summary(_ refund: RefundInput) -> some View {
        if let original, original.event.id == refund.sourceEventId {
            ApprovalOriginalEntry(detail: original, member: member)
        }
        Section("Refund to record") {
            Text(refund.description).font(.headline)
            LabeledContent("Amount", value: refund.amountCentimes.absoluteCHF)
            LabeledContent("Received by", value: refund.payerId == member.userId ? "You" : "Your partner")
            LabeledContent("Date", value: refund.date.value)
            ForEach(refund.allocations, id: \.memberId) {
                LabeledContent(
                    $0.memberId == member.userId ? "Your share" : "Partner’s share", value: $0.centimes.absoluteCHF)
            }
            if let note = refund.note { Text(note) }
            NavigationLink("View original expense") {
                MoneyDetailScreen(session: session, member: member, eventId: refund.sourceEventId)
            }
        }
    }

    @ViewBuilder
    private func outcome(_ approval: RefundApproval) -> some View {
        if let receipt = approval.receipt {
            Text("Refund recorded.")
            NavigationLink("View recorded refund") {
                MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
            }
        } else if approval.status == .denied {
            Text("Refund declined. No refund was recorded by this approval.")
        } else {
            Text("This approval is awaiting its recorded result. Refresh to check again.")
        }
    }
    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRefundDecision(current)
            envelope = nil
            original = nil
            if saved == nil {
                let proposal = try await session.readRefundApproval(current, approvalId: approvalId)
                original = try await session.readMoneyDetail(
                    member: member, generation: current.generation,
                    eventId: proposal.approval.refund.sourceEventId)
                envelope = proposal
            }
        }
    }
    private func decide(_ approved: Bool) async {
        guard let context, let approval = envelope?.approval, approval.status == .pending,
            ApprovalTime.isOpen(approval.expiresAt, now: .now), original?.event.id == approval.refund.sourceEventId
        else { return }
        await perform {
            try await session.stageRefundDecision(
                .init(
                    operationId: approval.operationId, approvalId: approval.id,
                    refund: approval.refund, approved: approved), context: context)
            saved = try await session.savedRefundDecision(context)
            saved = try await session.retryRefundDecision(context)
        }
    }
    private func retry() async {
        guard let context else { return }
        await perform { saved = try await session.retryRefundDecision(context) }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRefundDecision(context, approvalId: saved.decision.approvalId)
            self.saved = nil
            envelope = try await session.readRefundApproval(context, approvalId: approvalId)
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
            if let context { saved = try? await session.savedRefundDecision(context) }
            notice = "Could not confirm this approval. It may have expired or changed. Check again online."
        }
    }
}
