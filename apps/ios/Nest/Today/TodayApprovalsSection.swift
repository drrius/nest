import SwiftUI

struct TodayApprovalsSection: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let refresh: UUID
    @Environment(\.scenePhase) private var scenePhase
    @State private var page: PendingFinancialApprovals?
    @State private var failed = false
    @State private var request = UUID()

    var body: some View {
        Group {
            if let page, !page.approvals.isEmpty {
                TodayForYouCard(title: "Waiting for your OK", systemImage: "lock.fill") {
                    NavigationLink("All") {
                        FinancialApprovalsScreen(session: model, member: member)
                    }
                    .accessibilityLabel("All proposals and saved decisions")
                } content: {
                    ForEach(Array(page.approvals.prefix(3).enumerated()), id: \.element.id) { index, row in
                        if index > 0 { NestRowDivider(leading: 16) }
                        FinancialApprovalRow(session: model, member: member, row: row)
                            .frame(maxWidth: .infinity, minHeight: 52, alignment: .leading)
                            .padding(.horizontal, 16)
                    }
                }
            } else if failed {
                TodayForYouRetry(text: "Couldn’t check your proposals") { Task { await load() } }
            }
        }
        .task(id: refresh) { await load() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { Task { await load() } }
        }
        .onDisappear { request = UUID() }
    }

    private func load() async {
        let current = UUID()
        request = current
        page = nil
        failed = false
        do {
            let context = try model.expenseContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let value = try await model.readPendingApprovals(context, after: nil)
            guard request == current, model.status == .ready(member) else { return }
            page = value
        } catch {
            guard request == current, model.status == .ready(member) else { return }
            failed = true
        }
    }
}
