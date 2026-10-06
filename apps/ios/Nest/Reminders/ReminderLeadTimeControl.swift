import SwiftUI

struct ReminderLeadTimeControl: View {
    @Binding var days: Int

    var body: some View {
        HStack(spacing: 12) {
            Text("Days before: \(days)")
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("reminder-lead-value")
            Spacer(minLength: 0)
            HStack(spacing: 8) {
                adjustment("Decrease days before", symbol: "minus", change: -1)
                    .disabled(days <= 0)
                adjustment("Increase days before", symbol: "plus", change: 1)
                    .disabled(days >= 730)
            }
        }
    }

    private func adjustment(_ title: String, symbol: String, change: Int) -> some View {
        Button {
            days = min(730, max(0, days + change))
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 18, weight: .semibold))
                .frame(width: 44, height: 44)
                .contentShape(Rectangle())
                .background(QuietPalette.soft, in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(ReminderAdjustmentStyle())
        .foregroundStyle(QuietPalette.accent)
        .accessibilityLabel(title)
        .accessibilityValue("\(days) days")
    }
}

private struct ReminderAdjustmentStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.5)
    }
}
