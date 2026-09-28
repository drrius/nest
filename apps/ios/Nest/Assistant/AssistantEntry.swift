import SwiftUI

struct AssistantEntry: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember

    var body: some View {
        NavigationLink {
            AssistantConversationsScreen(session: session, member: member).id(session.generation)
        } label: {
            Image(systemName: "bubble.left.and.bubble.right")
                .foregroundStyle(QuietPalette.accent).frame(minWidth: 44, minHeight: 44)
        }
        .accessibilityLabel("Private conversations")
    }
}
