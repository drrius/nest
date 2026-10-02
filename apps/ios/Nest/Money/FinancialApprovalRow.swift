import SwiftUI

struct FinancialApprovalRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let row: PendingFinancialApproval

    var body: some View {
        switch row.command {
        case .expense, .refund, .settlement, .correction, .createRule, .updateRule, .pauseRule, .cancelRule,
            .resumeRule, .recordCycle, .linkCycle, .dismissLegacy:
            NavigationLink {
                destination
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.command.title)
                    if let expiry = ApprovalTime.date(row.expiresAt) {
                        Text("Expires \(expiry.formatted(date: .abbreviated, time: .shortened))")
                            .font(.caption).foregroundStyle(QuietPalette.muted)
                    }
                }
            }
        default:
            VStack(alignment: .leading, spacing: 4) {
                Text(row.command.title)
                Text("Review for this proposal type is not available in this build.")
                    .font(.caption).foregroundStyle(QuietPalette.muted)
            }
        }
    }

    @ViewBuilder private var destination: some View {
        switch row.command {
        case .expense:
            ExpenseApprovalScreen(session: session, member: member, approvalId: row.id)
        case .refund:
            RefundApprovalScreen(session: session, member: member, approvalId: row.id)
        case .settlement:
            SettlementApprovalScreen(session: session, member: member, approvalId: row.id)
        case .correction:
            CorrectionApprovalScreen(session: session, member: member, approvalId: row.id)
        case .createRule, .updateRule:
            RecurringApprovalScreen(session: session, member: member, approvalId: row.id)
        case .pauseRule, .cancelRule:
            RecurringStateApprovalScreen(session: session, member: member, approvalId: row.id).id(session.generation)
        case .resumeRule:
            RecurringResumeApprovalScreen(session: session, member: member, approvalId: row.id).id(session.generation)
        case .recordCycle:
            VariableCycleApprovalScreen(session: session, member: member, approvalId: row.id).id(session.generation)
        case .linkCycle:
            ManualCycleApprovalScreen(session: session, member: member, approvalId: row.id).id(session.generation)
        case .dismissLegacy:
            LegacyDismissalApprovalScreen(session: session, member: member, approvalId: row.id).id(session.generation)
        default:
            EmptyView()
        }
    }
}
