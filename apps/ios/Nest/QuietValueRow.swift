import SwiftUI

struct QuietValueRow: View {
    let title: String
    let value: String

    init(_ title: String, value: String) {
        self.title = title
        self.value = value
    }

    var body: some View {
        LabeledContent {
            Text(value).foregroundStyle(QuietPalette.ink)
        } label: {
            Text(title).foregroundStyle(QuietPalette.ink)
        }
    }
}
