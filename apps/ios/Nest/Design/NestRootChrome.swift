import SwiftUI

/// Native large title, an optional subtitle and the profile avatar for every tab root.
struct NestRootChrome<Actions: View>: ViewModifier {
    let title: String
    var subtitle: String?
    @ObservedObject var session: SessionModel
    let member: VerifiedMember?
    @ViewBuilder var actions: Actions

    func body(content: Content) -> some View {
        content
            .nestScreen()
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.large)
            .modifier(NestSubtitle(subtitle: subtitle))
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) { actions }
                if let member {
                    ToolbarItem(placement: .topBarTrailing) {
                        ProfileAvatarButton(session: session, member: member)
                    }
                }
            }
    }
}

extension View {
    func nestRootChrome<Actions: View>(
        _ title: String, subtitle: String? = nil, session: SessionModel, member: VerifiedMember?,
        @ViewBuilder actions: () -> Actions
    ) -> some View {
        modifier(
            NestRootChrome(title: title, subtitle: subtitle, session: session, member: member, actions: actions))
    }

    func nestRootChrome(_ title: String, subtitle: String? = nil, session: SessionModel, member: VerifiedMember?)
        -> some View
    {
        nestRootChrome(title, subtitle: subtitle, session: session, member: member) { EmptyView() }
    }
}

private struct NestSubtitle: ViewModifier {
    let subtitle: String?

    func body(content: Content) -> some View {
        if #available(iOS 26, *), let subtitle {
            content.navigationSubtitle(subtitle)
        } else {
            content
        }
    }
}

struct ProfileAvatarButton: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember

    var body: some View {
        NavigationLink {
            ProfileScreen(model: session, member: member)
        } label: {
            MemberAvatar(id: member.userId, size: 32)
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Profile and preferences")
        .accessibilityIdentifier("tab-profile-action")
    }
}
