import SwiftUI

struct MoneyScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var balance: MoneyBalance?
    @State private var loading = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        List {
            Section("Shared balance") {
                if let own = balance?.members.first(where: { $0.actorId == member.userId }) {
                    Text(
                        own.centimes.value == 0
                            ? "You’re settled up"
                            : own.centimes.value > 0 ? "Your partner owes you" : "You owe your partner")
                    Text(own.centimes.absoluteCHF).font(.largeTitle.weight(.semibold)).monospacedDigit()
                    Text("Across your shared expenses").foregroundStyle(QuietPalette.muted)
                } else if loading {
                    ProgressView("Loading balance…")
                }
                if let notice { Text(notice) }
                Button("Refresh balance") { Task { await load() } }.disabled(loading)
            }
            Section {
                NavigationLink("Add expense") { ExpenseScreen(session: session, member: member).id(session.generation) }
            }
            Section {
                NavigationLink("Record a payment") {
                    SettlementScreen(session: session, member: member).id(session.generation)
                }
            }
            Section {
                NavigationLink("Bills to confirm") {
                    RecurringRulesScreen(session: session, member: member, dueOnly: true).id(session.generation)
                }
                NavigationLink("Recurring expenses") {
                    RecurringRulesScreen(session: session, member: member, dueOnly: false).id(session.generation)
                }
            }
            MoneyHistorySection(session: session, member: member)
        }
        .navigationTitle("Money")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        let attempt = UUID()
        request = attempt
        loading = true
        balance = nil
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            let result = try await session.readMoneyBalance(member: member, generation: session.generation)
            try Task.checkCancellation()
            guard request == attempt else { return }
            balance = result
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not confirm your balance. Try again online."
        }
    }
}
