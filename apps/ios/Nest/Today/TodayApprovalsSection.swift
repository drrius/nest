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
        VStack(alignment: .leading, spacing: 14) {
            Text("For your review").font(.headline).foregroundStyle(QuietPalette.ink)
            Text("Financial proposals · private to you")
                .font(.caption).foregroundStyle(QuietPalette.muted)
            if let page {
                if page.approvals.isEmpty {
                    Text("No pending proposals.").foregroundStyle(QuietPalette.muted)
                }
                ForEach(Array(page.approvals.prefix(3))) { row in
                    FinancialApprovalRow(session: model, member: member, row: row)
                        .frame(minHeight: 44, alignment: .leading)
                }
            } else if failed {
                Text("Could not check your proposals. Try again online.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Try again") { Task { await load() } }.frame(minHeight: 44)
            } else {
                ProgressView("Checking proposals…")
            }
            NavigationLink {
                FinancialApprovalsScreen(session: model, member: member)
            } label: {
                Text("All proposals and saved decisions")
                    .font(.subheadline.weight(.medium)).frame(minHeight: 44, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
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
