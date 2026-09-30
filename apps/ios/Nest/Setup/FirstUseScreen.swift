import SwiftUI

struct FirstUseScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @ObservedObject var entry: FirstUseModel
    @State private var comprehensive = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    Text("A little less to remember.")
                        .font(.largeTitle.weight(.semibold)).foregroundStyle(QuietPalette.ink)
                    Text("Your day, meals and shared expenses, together in Nest.")
                        .font(.title3).foregroundStyle(QuietPalette.muted)
                    Text("Welcome, \(member.displayName).")
                        .font(.headline).padding(.top, 8)
                    Text(
                        "Start with what you need today, or review your choices now. You and your partner can set up independently."
                    )
                    .foregroundStyle(QuietPalette.muted)
                    Button("Get started") {
                        if entry.choose(.quick, session: session) { entry.presented = false }
                    }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Button("Set up everything") {
                        if entry.choose(.comprehensive, session: session) { comprehensive = true }
                    }
                    .buttonStyle(.bordered).controlSize(.large)
                    Text(
                        "Setup is optional. Calendar and notification permissions are requested only when you choose to use them."
                    )
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
                    if let notice = entry.notice {
                        Text(notice).font(.footnote)
                        Button("Continue for now") { _ = entry.continueForNow(session: session) }
                            .buttonStyle(.bordered).controlSize(.large)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading).padding(24)
            }
            .background(QuietPalette.background).navigationTitle("Nest")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(isPresented: $comprehensive) {
                SetupScreen(session: session, member: member, getStarted: { entry.presented = false })
            }
        }
        .tint(QuietPalette.accent)
    }
}
