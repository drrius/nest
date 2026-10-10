import SwiftUI

struct FirstUseScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @ObservedObject var entry: FirstUseModel
    @State private var comprehensive = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    NestArt(width: 140).frame(maxWidth: .infinity)
                    Text("Hi \(member.displayName). How do you want to start?")
                        .font(.title.weight(.bold)).foregroundStyle(NestColor.ink)
                    Text("You and your partner set up separately. Nothing here is required.")
                        .font(.subheadline).foregroundStyle(NestColor.ink2)
                    choice(
                        "Get started", detail: "Jump straight in. Each tab asks for what it needs the first time.",
                        icon: "arrow.right", primary: true
                    ) {
                        if entry.choose(.quick, session: session) { entry.presented = false }
                    }
                    choice(
                        "Set up everything",
                        detail: "About three minutes: your colour, what you eat, reminders and calendar.",
                        icon: "checklist", primary: false
                    ) {
                        if entry.choose(.comprehensive, session: session) { comprehensive = true }
                    }
                    Text("Calendar and notification permissions are only asked for when you use them.")
                        .font(.footnote).foregroundStyle(NestColor.ink3)
                    if let notice = entry.notice {
                        Text(notice).font(.footnote).foregroundStyle(NestColor.warn)
                        Button("Continue for now") { _ = entry.continueForNow(session: session) }
                            .buttonStyle(NestButtonStyle(kind: .secondary, fullWidth: true))
                    }
                }
                .padding(24)
            }
            .nestScreen()
            .navigationTitle("Nest")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $comprehensive) {
                SetupScreen(session: session, member: member, getStarted: { entry.presented = false })
            }
        }
        .tint(NestColor.accent)
    }

    private func choice(
        _ title: String, detail: String, icon: String, primary: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).font(.headline)
                    Text(detail).font(.subheadline).opacity(0.8).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 8)
                Image(systemName: icon).font(.body.weight(.semibold))
            }
            .foregroundStyle(primary ? NestColor.onAccent : NestColor.ink)
            .padding(18)
            .background(
                primary ? NestColor.accent : NestColor.card, in: RoundedRectangle(cornerRadius: 22, style: .continuous)
            )
            .shadow(color: .black.opacity(primary ? 0.12 : 0.05), radius: 12, y: 6)
        }
        .buttonStyle(NestPressStyle())
        .accessibilityLabel(title)
        .accessibilityHint(detail)
    }
}
