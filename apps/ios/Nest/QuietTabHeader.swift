import SwiftUI

struct QuietTabHeader: View {
    let title: String
    let subtitle: String
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var contextLabel = "Our household"
    @Environment(\.dynamicTypeSize) private var textSize
    @ScaledMetric(relativeTo: .caption) private var contextHeight: CGFloat = 32

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if textSize.isAccessibilitySize {
                context.frame(minHeight: contextHeight, alignment: .topLeading)
                actions.frame(maxWidth: .infinity, alignment: .trailing).padding(.top, 8)
            } else {
                HStack {
                    context
                    Spacer(minLength: 8)
                    actions
                }
            }
            Text(title).font(.largeTitle.weight(.semibold))
                .foregroundStyle(QuietPalette.ink).accessibilityAddTraits(.isHeader)
                .accessibilityIdentifier("tab-header-\(title.lowercased())")
            Text(subtitle).font(.subheadline).foregroundStyle(QuietPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var context: some View {
        Text(contextLabel).font(.caption).foregroundStyle(QuietPalette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            AssistantEntry(session: session, member: member)
                .accessibilityIdentifier("tab-assistant-action")
            NavigationLink {
                ProfileScreen(model: session, member: member)
            } label: {
                Image(systemName: "person.crop.circle")
                    .font(.title2).foregroundStyle(QuietPalette.accent)
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }
            .accessibilityLabel("Profile and preferences")
            .accessibilityIdentifier("tab-profile-action")
        }
        .buttonStyle(.plain)
    }
}
