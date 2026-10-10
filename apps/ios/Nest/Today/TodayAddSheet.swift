import SwiftUI

/// The one + on Today: a small sheet of big, obvious choices, plus a way to just ask Nest.
struct TodayAddSheet: View {
    let choose: (TodayRoute) -> Void
    @Environment(\.switchTab) private var switchTab
    @Environment(\.dismiss) private var dismiss
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        // At accessibility text sizes the tiles stack in one column and the sheet scrolls from full height.
        ScrollView {
            content
        }
        .scrollBounceBehavior(.basedOnSize)
        .background(NestColor.background.ignoresSafeArea())
        .presentationDetents(textSize.isAccessibilitySize ? [.large] : [.height(470), .large])
        .presentationDragIndicator(.visible)
        .onAppear { appeared = true }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 18) {
            HStack {
                Text("Add to Nest").font(.title2.weight(.bold)).foregroundStyle(NestColor.ink)
                Spacer()
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark").font(.body.weight(.semibold))
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .background(NestColor.fill, in: Circle())
                .accessibilityLabel("Close")
            }
            LazyVGrid(
                columns: Array(
                    repeating: GridItem(.flexible(), spacing: 12), count: textSize.isAccessibilitySize ? 1 : 2),
                spacing: 12
            ) {
                tile(0, "checkmark", .house, "Chore", "Once or repeating", .newChore)
                tile(1, "basket", .groceries, "Groceries", "Add to the list", .addGrocery)
                tile(2, "banknote", .money, "Expense", "Split it fairly", .expense)
                tile(3, "list.bullet", .neutral, "All chores", "See and manage", .chores)
            }
            Button {
                dismiss()
                switchTab(.assistant)
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: "sparkles").foregroundStyle(NestColor.accentInk)
                    Text("Or just ask Nest").foregroundStyle(NestColor.ink2)
                    Spacer()
                    Image(systemName: "arrow.up").font(.footnote.weight(.bold)).foregroundStyle(NestColor.ink3)
                }
                .padding(.horizontal, 18)
                .frame(minHeight: 54)
                .background(NestColor.accentSoft, in: Capsule())
            }
            .buttonStyle(NestPressStyle())
        }
        .padding(.horizontal, 20)
        .padding(.top, 22)
        .padding(.bottom, 20)
    }

    private func tile(
        _ index: Int, _ symbol: String, _ domain: NestDomain, _ title: String, _ subtitle: String,
        _ route: TodayRoute
    ) -> some View {
        Button {
            choose(route)
        } label: {
            VStack(alignment: .leading, spacing: 0) {
                IconTile(systemName: symbol, domain: domain, size: 42, solid: true)
                Spacer(minLength: 16)
                Text(title).font(.headline).foregroundStyle(NestColor.ink)
                Text(subtitle).font(.footnote).foregroundStyle(NestColor.ink2)
            }
            .frame(maxWidth: .infinity, minHeight: 126, alignment: .leading)
            .nestCard(padding: 16, radius: 22)
        }
        .buttonStyle(NestPressStyle())
        .opacity(appeared ? 1 : 0)
        .offset(y: appeared || reduceMotion ? 0 : 14)
        .animation(
            reduceMotion
                ? .easeOut(duration: 0.2) : .spring(response: 0.45, dampingFraction: 0.8).delay(Double(index) * 0.04),
            value: appeared
        )
        .accessibilityLabel(title)
        .accessibilityHint(subtitle)
    }
}

/// Switches tabs from anywhere, for example from Today's shortcuts or the Add sheet.
struct TabSwitchAction: Sendable {
    var action: @MainActor @Sendable (HouseholdTab) -> Void = { _ in }

    @MainActor func callAsFunction(_ tab: HouseholdTab) { action(tab) }
}

private struct TabSwitchKey: EnvironmentKey {
    static let defaultValue = TabSwitchAction()
}

extension EnvironmentValues {
    var switchTab: TabSwitchAction {
        get { self[TabSwitchKey.self] }
        set { self[TabSwitchKey.self] = newValue }
    }
}
