import SwiftUI

struct FinancialApprovalsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var legacyRecovery: LegacyDecisionRecoveryModel
    @State private var rows: [PendingFinancialApproval] = []
    @State private var saved: SavedExpenseDecision?
    @State private var savedRefund: SavedRefundDecision?
    @State private var savedSettlement: SavedSettlementDecision?
    @State private var savedCorrection: SavedCorrectionDecision?
    @State private var savedRecurring: SavedRecurringDecision?
    @State private var savedRecurringState: SavedRecurringStateDecision?
    @State private var savedRecurringResume: SavedRecurringResumeDecision?
    @State private var savedVariableCycle: SavedVariableCycleDecision?
    @State private var savedManualCycle: SavedManualCycleDecision?
    @State private var next: UUID?
    @State private var loading = false
    @State private var loaded = false
    @State private var notice: String?

    init(session: SessionModel, member: VerifiedMember) {
        self.session = session
        self.member = member
        _legacyRecovery = StateObject(wrappedValue: LegacyDecisionRecoveryModel(session: session, member: member))
    }

    var body: some View {
        List {
            Section {
                Text("Private to you. Review the exact change before deciding.")
                    .foregroundStyle(QuietPalette.muted)
            }
            if let saved {
                QuietFormSection("Saved decision") {
                    NavigationLink("Check expense decision") {
                        ExpenseApprovalScreen(session: session, member: member, approvalId: saved.decision.approvalId)
                    }
                }
            }
            if let savedRefund {
                QuietFormSection("Saved refund decision") {
                    NavigationLink("Check refund decision") {
                        RefundApprovalScreen(
                            session: session, member: member, approvalId: savedRefund.decision.approvalId)
                    }
                }
            }
            if let savedSettlement {
                QuietFormSection("Saved payment decision") {
                    NavigationLink("Check payment decision") {
                        SettlementApprovalScreen(
                            session: session, member: member,
                            approvalId: savedSettlement.decision.approvalId)
                    }
                }
            }
            if let savedCorrection {
                QuietFormSection("Saved correction decision") {
                    NavigationLink("Check correction decision") {
                        CorrectionApprovalScreen(
                            session: session, member: member,
                            approvalId: savedCorrection.decision.approvalId)
                    }
                }
            }
            if let savedRecurring {
                QuietFormSection("Saved recurring decision") {
                    NavigationLink("Check recurring decision") {
                        RecurringApprovalScreen(
                            session: session, member: member,
                            approvalId: savedRecurring.decision.approvalId)
                    }
                }
            }
            if let savedRecurringState {
                QuietFormSection("Saved pause or cancellation decision") {
                    NavigationLink("Check rule change decision") {
                        RecurringStateApprovalScreen(
                            session: session, member: member, approvalId: savedRecurringState.decision.approvalId
                        )
                        .id(session.generation)
                    }
                }
            }
            QuietFormSection("Waiting for your review") {
                ForEach(rows) { row in
                    FinancialApprovalRow(session: session, member: member, row: row)
                }
                if loaded && rows.isEmpty { Text("No pending financial approvals.") }
                if let notice { Text(notice) }
                if loading { ProgressView("Loading approvals…") }
                if next != nil { Button("Load more") { Task { await load(more: true) } }.disabled(loading) }
                Button("Refresh approvals") { Task { await load(more: false) } }.disabled(loading)
            }
            laterSavedDecisions
            savedLinkDecision
            LegacyDecisionRecoverySection(session: session, member: member, model: legacyRecovery)
        }
        .navigationTitle("Your approvals")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task(id: session.generation) { await load(more: false) }
    }

    @ViewBuilder private var laterSavedDecisions: some View {
        if let savedRecurringResume {
            QuietFormSection("Saved resumption decision") {
                NavigationLink("Check resumption decision") {
                    RecurringResumeApprovalScreen(
                        session: session, member: member, approvalId: savedRecurringResume.decision.approvalId
                    ).id(session.generation)
                }
            }
        }
        if let savedVariableCycle {
            QuietFormSection("Saved bill decision") {
                NavigationLink("Check bill decision") {
                    VariableCycleApprovalScreen(
                        session: session, member: member, approvalId: savedVariableCycle.decision.approvalId
                    ).id(session.generation)
                }
            }
        }
    }

    @ViewBuilder private var savedLinkDecision: some View {
        if let savedManualCycle {
            QuietFormSection("Saved expense-link decision") {
                NavigationLink("Check expense-link decision") {
                    ManualCycleApprovalScreen(
                        session: session, member: member, approvalId: savedManualCycle.decision.approvalId
                    ).id(session.generation)
                }
            }
        }
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
            savedRecurringResume = nil
            savedVariableCycle = nil
            savedManualCycle = nil
            await legacyRecovery.load()
        }
        do {
            let context = try session.expenseContext()
            saved = try await session.savedExpenseDecision(context)
            savedRefund = try await session.savedRefundDecision(context)
            savedSettlement = try await session.savedSettlementDecision(context)
            savedCorrection = try await session.savedCorrectionDecision(context)
            savedRecurring = try await session.savedRecurringDecision(context)
            savedRecurringState = try await session.savedRecurringStateDecision(context)
            savedRecurringResume = try await session.savedRecurringResumeDecision(context)
            savedVariableCycle = try await session.savedVariableCycleDecision(context)
            savedManualCycle = try await session.savedManualCycleDecision(context)
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
