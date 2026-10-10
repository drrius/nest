import SwiftUI

struct MoneyQuickActions: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        Group {
            if textSize.isAccessibilitySize {
                VStack(spacing: 12) {
                    expense
                    payment
                }
            } else {
                HStack(spacing: 12) {
                    expense
                    payment
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var expense: some View {
        NavigationLink {
            ExpenseScreen(session: session, member: member).id(session.generation)
        } label: {
            Label("Expense", systemImage: "plus")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 52)
                .padding(.horizontal, 12)
                .foregroundStyle(QuietPalette.onAccent)
                .background(QuietPalette.accent, in: RoundedRectangle(cornerRadius: 16))
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Add expense")
    }

    private var payment: some View {
        NavigationLink {
            SettlementScreen(session: session, member: member).id(session.generation)
        } label: {
            Text("Settle up")
                .font(.subheadline.weight(.semibold))
                .frame(maxWidth: .infinity, minHeight: 52)
                .padding(.horizontal, 12)
                .foregroundStyle(QuietPalette.accent)
                .background(QuietPalette.soft, in: RoundedRectangle(cornerRadius: 16))
                .contentShape(Rectangle())
        }
        .accessibilityLabel("Record a payment")
    }
}
