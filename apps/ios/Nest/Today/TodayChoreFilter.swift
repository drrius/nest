import SwiftUI

struct TodayChoreFilter: View {
    @Binding var everyone: Bool
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        if textSize.isAccessibilitySize {
            VStack(alignment: .leading, spacing: 8) {
                Text("Show chores").font(.caption).foregroundStyle(QuietPalette.muted)
                option("Me + shared", value: false)
                option("Everyone", value: true)
            }
        } else {
            HStack(spacing: 8) {
                option("Me + shared", value: false)
                option("Everyone", value: true)
            }
        }
    }

    private func option(_ title: String, value: Bool) -> some View {
        Button {
            everyone = value
        } label: {
            HStack(spacing: 12) {
                Text(title).foregroundStyle(QuietPalette.ink)
                Spacer(minLength: 0)
                Image(systemName: "checkmark")
                    .foregroundStyle(QuietPalette.accent)
                    .opacity(everyone == value ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 12))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(everyone == value ? .isSelected : [])
    }
}
