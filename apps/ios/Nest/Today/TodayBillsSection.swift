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
            if page?.rules.isEmpty != true {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Bills to confirm").font(.headline).foregroundStyle(QuietPalette.ink)
                    if let page {
                        Text("Review the amount and split before recording each bill.")
                            .font(.subheadline).foregroundStyle(QuietPalette.muted)
                        ForEach(Array(page.rules.prefix(3))) { rule in
                            NavigationLink {
                                VariableCycleScreen(session: session, member: member, ruleId: rule.id)
                                    .id(session.generation)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(rule.configuration.description)
                                    if let due = rule.nextDueOn {
                                        Text("Due \(due.value)").font(.caption).foregroundStyle(QuietPalette.muted)
                                    }
                                }
                                .frame(minHeight: 44, alignment: .leading)
                                .contentShape(Rectangle())
                            }
                        }
                    } else if failed {
                        Text("Could not check due bills. Try again online.").foregroundStyle(QuietPalette.muted)
                        Button("Try again") { Task { await load() } }.frame(minHeight: 44)
                    } else {
                        ProgressView("Checking due bills…")
                    }
                    NavigationLink {
                        RecurringRulesScreen(session: session, member: member, dueOnly: true)
                    } label: {
                        QuietActionLabel("View all due bills").font(.subheadline.weight(.medium))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(18)
                .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
                .padding(.top, 24)
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
