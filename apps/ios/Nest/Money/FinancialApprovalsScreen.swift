import SwiftUI

struct FinancialApprovalsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var rows: [PendingFinancialApproval] = []
    @State private var saved: SavedExpenseDecision?
    @State private var savedRefund: SavedRefundDecision?
    @State private var savedSettlement: SavedSettlementDecision?
    @State private var savedCorrection: SavedCorrectionDecision?
    @State private var savedRecurring: SavedRecurringDecision?
    @State private var savedRecurringState: SavedRecurringStateDecision?
    @State private var next: UUID?
    @State private var loading = false
    @State private var loaded = false
    @State private var notice: String?

    var body: some View {
        List {
            Section {
                Text("Private to you. Review the exact change before deciding.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if let saved {
                Section("Saved decision") {
                    NavigationLink("Check expense decision") {
                        ExpenseApprovalScreen(session: session, member: member, approvalId: saved.decision.approvalId)
                    }
                }
            }
            if let savedRefund {
                Section("Saved refund decision") {
                    NavigationLink("Check refund decision") {
                        RefundApprovalScreen(
                            session: session, member: member, approvalId: savedRefund.decision.approvalId)
                    }
                }
            }
            if let savedSettlement {
                Section("Saved payment decision") {
                    NavigationLink("Check payment decision") {
                        SettlementApprovalScreen(
                            session: session, member: member,
                            approvalId: savedSettlement.decision.approvalId)
                    }
                }
            }
            if let savedCorrection {
                Section("Saved correction decision") {
                    NavigationLink("Check correction decision") {
                        CorrectionApprovalScreen(
                            session: session, member: member,
                            approvalId: savedCorrection.decision.approvalId)
                    }
                }
            }
            if let savedRecurring {
                Section("Saved recurring decision") {
                    NavigationLink("Check recurring decision") {
                        RecurringApprovalScreen(
                            session: session, member: member,
                            approvalId: savedRecurring.decision.approvalId)
                    }
                }
            }
            if let savedRecurringState {
                Section("Saved pause or cancellation decision") {
                    NavigationLink("Check rule change decision") {
                        RecurringStateApprovalScreen(
                            session: session, member: member, approvalId: savedRecurringState.decision.approvalId)
                            .id(session.generation)
                    }
                }
            }
            Section("Waiting for your review") {
                ForEach(rows) { row in
                    FinancialApprovalRow(session: session, member: member, row: row)
                }
                if loaded && rows.isEmpty { Text("No pending financial approvals.") }
                if let notice { Text(notice) }
                if loading { ProgressView("Loading approvals…") }
                if next != nil { Button("Load more") { Task { await load(more: true) } }.disabled(loading) }
                Button("Refresh approvals") { Task { await load(more: false) } }.disabled(loading)
            }
        }
        .navigationTitle("Your approvals")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load(more: false) }
    }

    private func load(more: Bool) async {
        guard !loading else { return }
        loading = true
        notice = nil
        defer { loading = false }
        let cursor = more ? next : nil
        if !more {
            rows = []
            next = nil
            loaded = false
            saved = nil
            savedRefund = nil
            savedSettlement = nil
            savedCorrection = nil
            savedRecurring = nil
            savedRecurringState = nil
        }
        do {
            let context = try session.expenseContext()
            saved = try await session.savedExpenseDecision(context)
            savedRefund = try await session.savedRefundDecision(context)
            savedSettlement = try await session.savedSettlementDecision(context)
            savedCorrection = try await session.savedCorrectionDecision(context)
            savedRecurring = try await session.savedRecurringDecision(context)
            savedRecurringState = try await session.savedRecurringStateDecision(context)
            let page = try await session.readPendingApprovals(context, after: cursor)
            try Task.checkCancellation()
            rows.append(contentsOf: page.approvals)
            next = page.next
            loaded = true
        } catch {
            guard !Task.isCancelled else { return }
            notice = "Could not load approvals. Try again online."
        }
    }
}
