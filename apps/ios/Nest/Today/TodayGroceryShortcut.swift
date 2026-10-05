import SwiftUI

struct TodayGroceryShortcut: View {
    let summary: String
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, minHeight: 76, alignment: .leading)
            .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
            .contentShape(Rectangle())
    }

    @ViewBuilder private var content: some View {
        if textSize.isAccessibilitySize {
            text
        } else {
            HStack(spacing: 14) {
                Image(systemName: "basket")
                    .font(.title3)
                    .foregroundStyle(QuietPalette.accent)
                    .accessibilityHidden(true)
                text
                Spacer()
                Image(systemName: "chevron.right")
                    .foregroundStyle(QuietPalette.muted)
                    .accessibilityHidden(true)
            }
        }
    }

    private var text: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text("Groceries").font(.headline).foregroundStyle(QuietPalette.ink)
            Text(summary).font(.subheadline).foregroundStyle(QuietPalette.muted)
        }
    }
}
