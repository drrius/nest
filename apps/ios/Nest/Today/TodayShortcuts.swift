import SwiftUI

/// Two glanceable cards: what's on the shared grocery list, and where the balance stands.
struct TodayShortcuts: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let refresh: UUID
    @State private var balance: MoneyBalance?
    @State private var balanceNotice: String?
    @State private var balanceRequest = UUID()
    @Environment(\.switchTab) private var switchTab
    @Environment(\.memberPalette) private var palette

    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        let layout =
            textSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 12)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            NavigationLink {
                GroceriesScreen(model: model)
            } label: {
                card(icon: "basket", domain: .groceries, title: "Groceries") {
                    Text(groceryLine).font(.subheadline).foregroundStyle(NestColor.ink2)
                    if !groceryPreview.isEmpty {
                        Text(groceryPreview).font(.caption).foregroundStyle(NestColor.ink3).lineLimit(1)
                    }
                }
            }
            .buttonStyle(NestPressStyle())
            .accessibilityLabel("Groceries, \(groceryLine)")
            Button {
                switchTab(.money)
            } label: {
                card(icon: "wallet.bifold", domain: .money, title: balanceTitle) {
                    if let balanceNotice {
                        Label(balanceNotice, systemImage: "exclamationmark.circle")
                            .font(.caption).foregroundStyle(NestColor.warn)
                    }
                    if own == 0 {
                        Label("Nothing owed", systemImage: "checkmark.circle.fill")
                            .font(.subheadline).foregroundStyle(NestColor.good)
                    } else {
                        Text(balanceAmount)
                            .font(.system(.title3, design: .rounded, weight: .semibold))
                            .monospacedDigit().foregroundStyle(NestColor.ink)
                    }
                }
            }
            .buttonStyle(NestPressStyle())
        }
        .task(id: refresh) { await loadBalance() }
    }

    private func card<Content: View>(
        icon: String, domain: NestDomain, title: String, @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            IconTile(systemName: icon, domain: domain, size: 34)
                .padding(.bottom, 9)
            Text(title).font(.headline).foregroundStyle(NestColor.ink)
            content()
        }
        .frame(maxWidth: .infinity, minHeight: 120, alignment: .topLeading)
        .nestCard(padding: 16, radius: 22)
    }

    private var openGroceries: [LocalGrocery] {
        guard case .loaded(let state) = model.groceries else { return [] }
        return state.items.filter { !$0.checked }
    }

    private var groceryLine: String {
        switch model.groceries {
        case .idle, .loading: return "Loading…"
        case .failed: return "Couldn’t load"
        case .loaded(let state):
            let conflicts = state.items.filter { $0.state == .conflict }.count
            if conflicts > 0 { return conflicts == 1 ? "1 change needs review" : "\(conflicts) changes need review" }
            let pending = state.items.filter { $0.state == .pending || $0.state == .acknowledged }.count
            if pending > 0 { return pending == 1 ? "1 change syncing" : "\(pending) changes syncing" }
            let count = openGroceries.count
            return count == 0 ? "All got" : count == 1 ? "1 to get" : "\(count) to get"
        }
    }

    private var groceryPreview: String {
        openGroceries.prefix(3).map(\.item.name).joined(separator: ", ")
    }

    private var own: Int64? {
        balance?.members.first { $0.actorId == member.userId }?.centimes.value
    }

    private var balanceTitle: String {
        guard let own else { return "Money" }
        if own == 0 { return "All square" }
        return own > 0 ? "\(palette.partnerName) owes you" : "You owe \(palette.partnerName)"
    }

    private var balanceAmount: String {
        guard let own else { return "—" }
        return Centimes.chf(abs(own))
    }

    private func loadBalance() async {
        let attempt = UUID()
        balanceRequest = attempt
        if balance == nil,
            let saved = try? await model.cachedMoneyRead(.balance(member), generation: model.generation)
        {
            balance = saved.value
        }
        do {
            let fresh = try await model.loadMoneyBalance(member: member, generation: model.generation)
            guard balanceRequest == attempt else { return }
            balance = fresh.value
            balanceNotice = fresh.notice == nil ? nil : "Not up to date"
        } catch {
            guard !Task.isCancelled, balanceRequest == attempt else { return }
            balanceNotice = balance == nil ? "Couldn’t load" : "Not up to date"
        }
    }
}

extension Centimes {
    /// "CHF 84.50" with grouping for larger amounts.
    static func chf(_ centimes: Int64) -> String {
        let francs = centimes / 100
        let grouped = francs.formatted(.number.grouping(.automatic).locale(Locale(identifier: "de_CH")))
        return "CHF \(grouped).\(String(format: "%02lld", centimes % 100))"
    }
}
