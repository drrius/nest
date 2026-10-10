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
            VStack(alignment: .leading, spacing: 24) {
                MoneyBalanceCard(
                    session: session, member: member, balance: balance, loading: loading, notice: notice,
                    retry: { Task { await load() } })
                VStack(spacing: 12) {
                    TodayBillsSection(session: session, member: member, refresh: refresh).id(member.userId)
                    TodayApprovalsSection(model: session, member: member, refresh: refresh).id(member.userId)
                }
                billsCard
                MoneyHistorySection(session: session, member: member, previewCount: 6)
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 32)
        }
        .nestRootChrome("Money", session: session, member: member)
        .task { await load() }
        .refreshable {
            refresh = UUID()
            await load()
        }
    }

    @State private var refresh = UUID()

    private var billsCard: some View {
        VStack(spacing: 0) {
            NavigationLink {
                RecurringRulesScreen(session: session, member: member, dueOnly: false).id(session.generation)
            } label: {
                TodayForYouRow(
                    icon: "repeat", domain: .money, title: "Recurring expenses",
                    detail: "Bills that add themselves, and ones you confirm")
            }
            .buttonStyle(NestPressStyle())
            NestRowDivider(leading: 64)
            NavigationLink {
                RenewalsScreen(session: session, member: member).id(session.generation)
            } label: {
                TodayForYouRow(
                    icon: "calendar.badge.clock", domain: .bill, title: "Renewals",
                    detail: "Renewal dates and when to cancel by")
            }
            .buttonStyle(NestPressStyle())
            .accessibilityLabel("Manage renewals")
            NestRowDivider(leading: 64)
            NavigationLink {
                MoneyMoreScreen(session: session, member: member)
            } label: {
                TodayForYouRow(
                    icon: "tray.full", domain: .neutral, title: "Older saved changes",
                    detail: "Approvals and drafts from earlier versions")
            }
            .buttonStyle(NestPressStyle())
        }
        .nestCard(padding: 0)
    }

    private func load() async {
        let attempt = UUID()
        request = attempt
        loading = true
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            if balance == nil,
                let saved = try? await session.cachedMoneyRead(.balance(member), generation: session.generation)
            {
                guard request == attempt, !Task.isCancelled else { return }
                balance = saved.value
                notice = saved.notice
            }
            let result = try await session.loadMoneyBalance(member: member, generation: session.generation)
            try Task.checkCancellation()
            guard request == attempt else { return }
            balance = result.value
            notice = result.notice
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            if (error as? NestAPIFailure) != .unavailable && !(error is URLError) { balance = nil }
            notice =
                (error as? NestAPIFailure) == .householdIncomplete
                ? "Money will be ready when your partner’s verified account is linked to your household."
                : balance == nil
                    ? "Could not confirm your balance. Try again online."
                    : "Showing your previous balance. Connect and refresh for updates."
        }
    }
}
