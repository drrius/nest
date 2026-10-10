import SwiftUI

struct ProfileScreen: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var confirmSignOut = false
    @State private var signingOut = false

    var body: some View {
        List {
            Section {
                Label(member.displayName, systemImage: "person.crop.circle")
                    .font(.title2.weight(.semibold))
                Text("Your verified household account").foregroundStyle(QuietPalette.muted)
                NavigationLink("Your setup") {
                    SetupScreen(session: model, member: member).id(model.generation)
                }
            }
            Section("Meals") {
                NavigationLink("Your food preferences") {
                    FoodPreferencesScreen(model: model)
                }
                NavigationLink("Household cooking preferences") {
                    CookingPreferencesScreen(model: model)
                }
            }
            Section("Privacy") {
                NavigationLink("Private memory") {
                    PrivateMemoryScreen(session: model, member: member).id(model.generation)
                }
                NavigationLink("Calendar busy sharing") {
                    CalendarSharingScreen(session: model)
                }
                Text("Personal calendar details stay on this device. Busy sharing is optional.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
            Section("Notifications") {
                NavigationLink("Your notification choices") {
                    NotificationPreferencesScreen(session: model, member: member).id(model.generation)
                }
                NavigationLink("Your saved daily summary") {
                    DailySummaryScreen(session: model, member: member).id(model.generation)
                }
            }
            Section("Support") {
                NavigationLink("Diagnostics") { DiagnosticsScreen() }
            }
            Section {
                Button("Sign out on this device", role: .destructive) { confirmSignOut = true }
                    .disabled(signingOut)
                if signingOut { ProgressView("Signing out…") }
            }
        }
        .navigationTitle("Profile")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .confirmationDialog("Sign out on this device?", isPresented: $confirmSignOut) {
            Button("Sign out", role: .destructive) {
                signingOut = true
                Task {
                    await model.signOut()
                    signingOut = false
                }
            }
        } message: {
            Text("You’ll need to sign in again to access your household.")
        }
    }
}
