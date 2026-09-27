import SwiftUI

@main
struct NestApp: App {
    @StateObject private var model = SessionModel()

    var body: some Scene {
        WindowGroup {
            Group {
                switch model.status {
                case .configuration:
                    message("This development build is missing its public test configuration.")
                case .loading:
                    ProgressView("Checking your account…")
                case .signedOut:
                    AppleSignInView(model: model)
                case .notMember:
                    VStack(spacing: 16) {
                        message(
                            "This Apple account is not linked to your household. Use your existing account or ask for verified recovery."
                        )
                        Button("Sign out") { Task { await model.signOut() } }
                    }
                case .unavailable:
                    VStack(spacing: 12) {
                        Text("Could not verify your account. Try again online.")
                        Button("Try again") { Task { await model.restore() } }
                        Button("Sign out on this device") { Task { await model.signOut() } }
                    }
                case .ready(let member):
                    NavigationStack { TodayScreen(model: model, member: member) }
                }
            }
            .task { await model.restore() }
            .tint(QuietPalette.accent)
        }
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .multilineTextAlignment(.center)
            .foregroundStyle(QuietPalette.ink)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(24)
            .background(QuietPalette.background)
    }
}
