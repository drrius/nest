import SwiftUI

struct ProfileScreen: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    @State private var confirmSignOut = false
    @State private var signingOut = false

    @Environment(\.memberPalette) private var palette

    var body: some View {
        List {
            Section {
                VStack(spacing: 8) {
                    MemberAvatar(id: member.userId, size: 84)
                    Text(member.displayName).font(.title2.weight(.bold)).foregroundStyle(NestColor.ink)
                    if palette.partner != nil {
                        HStack(spacing: 6) {
                            Text("Nest household with")
                            MemberAvatar(id: palette.partner, size: 20)
                            Text(palette.partnerName)
                        }
                        .font(.footnote).foregroundStyle(NestColor.ink2)
                    }
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            Section {
                link("paintpalette.fill", .calendar) {
                    MemberColourRow()
                } destination: {
                    MemberColourScreen()
                }
                link("fork.knife", .meal, "Your food preferences") { FoodPreferencesScreen(model: model) }
                link("bell.fill", .bill, "Your notification choices") {
                    NotificationPreferencesScreen(session: model, member: member).id(model.generation)
                }
                link("text.badge.checkmark", .bill, "Your saved daily summary") {
                    DailySummaryScreen(session: model, member: member).id(model.generation)
                }
                link("calendar", .calendar, "Calendar busy sharing") { CalendarSharingScreen(session: model) }
                link("sparkles", .house, "Private memory") {
                    PrivateMemoryScreen(session: model, member: member).id(model.generation)
                }
            } header: {
                Text("You")
            } footer: {
                Text(
                    "Your preferences and memory are private. Your colour is shown to your partner. Calendar details stay on this iPhone; if you turn on busy sharing, your partner sees busy times only."
                )
            }
            Section("Household") {
                link("frying.pan.fill", .groceries, "Household cooking preferences") {
                    CookingPreferencesScreen(model: model)
                }
                link("checklist", .money, "Your setup") {
                    SetupScreen(session: model, member: member).id(model.generation)
                }
            }
            Section {
                link("stethoscope", .neutral, "Diagnostics") { DiagnosticsScreen() }
            }
            Section {
                Button("Sign out on this device", role: .destructive) { confirmSignOut = true }
                    .disabled(signingOut)
                    .frame(maxWidth: .infinity)
                if signingOut { ProgressView("Signing out…") }
            }
        }
        .navigationTitle("Profile")
        .scrollContentBackground(.hidden).nestScreen()
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

    private func link<Destination: View>(
        _ icon: String, _ domain: NestDomain, _ title: String, @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) {
            Label {
                Text(title)
            } icon: {
                IconTile(systemName: icon, domain: domain, size: 30, solid: true)
            }
        }
    }

    private func link<Row: View, Destination: View>(
        _ icon: String, _ domain: NestDomain, @ViewBuilder row: () -> Row,
        @ViewBuilder destination: () -> Destination
    ) -> some View {
        NavigationLink(destination: destination) { row() }
    }
}
