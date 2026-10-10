import SwiftUI

struct TodayBillsSection: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let refresh: UUID
    @Environment(\.scenePhase) private var scenePhase
    @State private var page: RecurringList?
    @State private var failed = false
    @State private var request = UUID()

    var body: some View {
        Group {
            if let page, !page.rules.isEmpty {
                TodayForYouCard(title: "Bills to confirm") {
                    NavigationLink("All") {
                        RecurringRulesScreen(session: session, member: member, dueOnly: true)
                    }
                    .accessibilityLabel("View all due bills")
                } content: {
                    ForEach(Array(page.rules.prefix(3).enumerated()), id: \.element.id) { index, rule in
                        if index > 0 { NestRowDivider(leading: 64) }
                        NavigationLink {
                            VariableCycleScreen(session: session, member: member, ruleId: rule.id)
                                .id(session.generation)
                        } label: {
                            TodayForYouRow(
                                icon: "bolt.fill", domain: .bill, title: rule.configuration.description,
                                detail: rule.nextDueOn.map { "Enter the amount · due \($0.value)" }
                                    ?? "Enter the amount")
                        }
                        .buttonStyle(NestPressStyle())
                    }
                }
            } else if failed {
                TodayForYouRetry(text: "Couldn’t check due bills") { Task { await load() } }
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
            let context = try session.expenseContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let value = try await session.readRecurringRules(context, after: nil, dueOnly: true)
            guard request == current, session.status == .ready(member) else { return }
            page = value
        } catch {
            guard request == current, session.status == .ready(member) else { return }
            failed = true
        }
    }
}
