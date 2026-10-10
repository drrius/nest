import SwiftUI

/// What you asked, right-aligned in a green bubble.
struct AssistantUserBubble: View {
    let text: String

    var body: some View {
        HStack {
            Spacer(minLength: 48)
            Text(text)
                .textSelection(.enabled)
                .foregroundStyle(NestColor.onAccent)
                .padding(.horizontal, 15)
                .padding(.vertical, 10)
                .background(
                    UnevenRoundedRectangle(
                        topLeadingRadius: 21, bottomLeadingRadius: 21, bottomTrailingRadius: 6, topTrailingRadius: 21,
                        style: .continuous
                    )
                    .fill(NestColor.accent))
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("You: \(text)")
    }
}
