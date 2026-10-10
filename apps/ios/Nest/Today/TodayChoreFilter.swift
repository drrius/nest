import SwiftUI

/// Whose chores Today shows. At accessibility text sizes the two options stack as full-width buttons.
struct TodayChoreFilter: View {
    @Binding var everyone: Bool
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        if textSize.isAccessibilitySize {
            VStack(spacing: 8) {
                option("Me + shared", everyone: false)
                option("Everyone", everyone: true)
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Show chores")
        } else {
            Picker("Show chores", selection: $everyone) {
                Text("Me + shared").tag(false)
                Text("Everyone").tag(true)
            }
            .pickerStyle(.segmented)
            .fixedSize()
        }
    }

    private func option(_ title: String, everyone value: Bool) -> some View {
        Button(title) { everyone = value }
            .buttonStyle(NestButtonStyle(kind: everyone == value ? .primary : .secondary, small: true, fullWidth: true))
            .accessibilityAddTraits(everyone == value ? .isSelected : [])
    }
}
