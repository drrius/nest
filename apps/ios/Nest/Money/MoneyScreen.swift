import SwiftUI

struct MoneyScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var balance: MoneyBalance?
    @State private var loading = false
    @State private var notice: String?
    @State private var request = UUID()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 24) {
                    QuietTabHeader(
                        title: "Money", subtitle: "All square, without the guesswork.",
                        session: session, member: member)
                    balanceCard
                    MoneyQuickActions(session: session, member: member)
                }
                .padding(.top, 14)
                MoneyHistorySection(session: session, member: member, previewCount: 5)
                Section("Bills and approvals") {
                    NavigationLink {
                        RecurringRulesScreen(session: session, member: member, dueOnly: true).id(session.generation)
                    } label: {
                        QuietActionLabel("Bills to confirm")
                    }
                    NavigationLink {
                        FinancialApprovalsScreen(session: session, member: member).id(session.generation)
                    } label: {
                        QuietActionLabel("Your financial approvals")
                    }
                    NavigationLink {
                        RecurringRulesScreen(session: session, member: member, dueOnly: false).id(session.generation)
                    } label: {
                        QuietActionLabel("Recurring expenses")
                    }
                }
                Section {
                    DisclosureGroup("Saved changes") {
                        NavigationLink {
                            LegacyDismissalScreen(session: session, member: member, draftId: nil).id(session.generation)
                        } label: {
                            QuietActionLabel("Draft dismissal")
                        }
                        NavigationLink {
                            LegacyConfirmationScreen(session: session, member: member, draftId: nil).id(
                                session.generation)
                        } label: {
                            QuietActionLabel("Draft confirmation")
                        }
                        NavigationLink {
                            LegacyAdoptionScreen(session: session, member: member, ruleId: nil).id(session.generation)
                        } label: {
                            QuietActionLabel("Rule adoption")
                        }
                    }
                    Button("Refresh balance") { Task { await load() } }.disabled(loading)
                        .frame(minHeight: 44)
                }
            }
            .padding(.horizontal, 20)
        }
        .buttonStyle(.plain)
        .foregroundStyle(QuietPalette.ink)
        .navigationTitle("")
        .background(QuietPalette.background)
        .task { await load() }
        .refreshable { await load() }
    }

    private var balanceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let own = balance?.members.first(where: { $0.actorId == member.userId }) {
                Text(
                    own.centimes.value == 0
                        ? "You’re settled up"
                        : own.centimes.value > 0 ? "Your partner owes you" : "You owe your partner"
                )
                .font(.subheadline)
                Text(own.centimes.absoluteCHF).font(.largeTitle.weight(.semibold)).monospacedDigit()
                    .fixedSize(horizontal: false, vertical: true)
                Text("Across your shared expenses").font(.subheadline).foregroundStyle(QuietPalette.muted)
            } else if loading {
                ProgressView("Loading balance…")
            }
            if let notice {
                Text(notice).font(.subheadline).foregroundStyle(QuietPalette.muted)
                Button("Try again") { Task { await load() } }.frame(minHeight: 44).disabled(loading)
            }
        }
        .padding(20).frame(maxWidth: .infinity, alignment: .leading)
        .background(QuietPalette.soft, in: RoundedRectangle(cornerRadius: 24))
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
