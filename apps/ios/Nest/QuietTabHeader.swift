import SwiftUI

struct QuietTabHeader: View {
    let title: String
    let subtitle: String
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if textSize.isAccessibilitySize {
                context
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
            Text(subtitle).font(.subheadline).foregroundStyle(QuietPalette.muted)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var context: some View {
        Text("Our household").font(.caption).foregroundStyle(QuietPalette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            AssistantEntry(session: session, member: member)
            NavigationLink {
                ProfileScreen(model: session, member: member)
            } label: {
                Image(systemName: "person.crop.circle")
                    .font(.title2).foregroundStyle(QuietPalette.accent)
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }
            .accessibilityLabel("Profile and preferences")
        }
    }
}
