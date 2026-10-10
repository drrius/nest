import SwiftUI

struct QuietSectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(QuietPalette.ink)
            .textCase(nil)
            .accessibilityAddTraits(.isHeader)
    }
}
