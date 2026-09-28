import SwiftUI

struct FinancialApprovalsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var rows: [PendingFinancialApproval] = []
    @State private var saved: SavedExpenseDecision?
    @State private var savedRefund: SavedRefundDecision?
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
            Section("Waiting for your review") {
                ForEach(rows) { row in
                    if row.command == .expense {
                        NavigationLink {
                            ExpenseApprovalScreen(session: session, member: member, approvalId: row.id)
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Record expense")
                                if let expiry = ApprovalTime.date(row.expiresAt) {
                                    Text("Expires \(expiry.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.caption).foregroundStyle(QuietPalette.muted)
                                }
                            }
                        }
                    } else if row.command == .refund {
                        NavigationLink("Review refund") {
                            RefundApprovalScreen(session: session, member: member, approvalId: row.id)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(row.command.rawValue)
                            Text("Review for this proposal type is not available in this build.")
                                .font(.caption).foregroundStyle(QuietPalette.muted)
                        }
                    }
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
        }
        do {
            let context = try session.expenseContext()
            saved = try await session.savedExpenseDecision(context)
            savedRefund = try await session.savedRefundDecision(context)
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
