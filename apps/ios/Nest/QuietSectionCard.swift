import SwiftUI

struct QuietSectionCard<Content: View>: View {
    var title: String? = nil
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let title { QuietSectionHeader(title: title) }
            VStack(alignment: .leading, spacing: 16) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
            .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
        }
        .font(.body)
        .foregroundStyle(QuietPalette.ink)
        .buttonStyle(QuietCardButtonStyle())
    }
}

private struct QuietCardButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .foregroundStyle(QuietPalette.accent)
            .contentShape(Rectangle())
            .opacity(enabled ? (configuration.isPressed ? 0.75 : 1) : 0.5)
    }
}
