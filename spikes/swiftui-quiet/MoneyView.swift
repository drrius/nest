import SwiftUI

struct QuietMoneyView: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SpikeLabel(text: "Design study · fictional data")
                SpikeHeader(
                    eyebrow: "Our household",
                    title: "Money",
                    subtitle: "All square, without the guesswork."
                )
                Text("Your partner owes you")
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.muted)
                    .padding(.top, 24)
                Text("CHF 84.50")
                    .font(.system(.largeTitle, design: .default, weight: .medium))
                    .foregroundStyle(QuietPalette.ink)
                    .padding(.top, 2)
                Text("Across your shared expenses")
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
                HStack(spacing: 10) {
                    action("Expense", filled: true)
                    action("Settle up", filled: false)
                }
                .padding(.top, 24)
                SpikeSectionTitle(text: "Recent activity")
                activity("Weekly groceries", detail: "You paid · split equally", amount: "CHF 68.40")
                activity("Dinner at home", detail: "Partner paid · split equally", amount: "CHF 32.00")
                activity("Internet", detail: "You paid · monthly", amount: "CHF 59.00")
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .background(QuietPalette.background)
    }

    private func action(_ title: String, filled: Bool) -> some View {
        Text(title)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(filled ? .white : QuietPalette.accent)
            .frame(maxWidth: .infinity, minHeight: 46)
            .background(
                filled ? QuietPalette.accent : QuietPalette.soft,
                in: RoundedRectangle(cornerRadius: 12)
            )
    }

    private func activity(_ title: String, detail: String, amount: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline)
                    .foregroundStyle(QuietPalette.ink)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
            }
            Spacer()
            Text(amount)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(QuietPalette.ink)
        }
        .frame(minHeight: 68)
        .overlay(alignment: .bottom) { QuietPalette.line.frame(height: 1) }
    }
}
