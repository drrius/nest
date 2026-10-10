import SwiftUI

struct SetupScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    var getStarted: (() -> Void)?
    @StateObject private var model = SetupModel()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            Section {
                Text("Choose what helps you. Each part is optional, and you can return from Profile whenever you like.")
                    .foregroundStyle(NestColor.ink2)
                Text(
                    "You and your partner have separate personal preferences. Cooking choices are shared."
                )
                .font(.footnote).foregroundStyle(NestColor.ink2)
            }
            Section {
                NavigationLink {
                    MemberColourScreen()
                } label: {
                    MemberColourRow()
                }
            } header: {
                Text("You")
            } footer: {
                Text("It marks your chores, your calendar and your side of the balance. Your partner sees it too.")
            }
            Section {
                NavigationLink {
                    FoodPreferencesScreen(model: session).id(session.generation)
                } label: {
                    SetupRow(
                        title: "Your food preferences", configured: model.status?.foodConfigured
                    )
                }
            } header: {
                Text("Your meals")
            } footer: {
                Text(
                    "Dietary restrictions and dislikes help household planning. Your calorie goal is optional and private."
                )
            }
            Section {
                NavigationLink {
                    CookingPreferencesScreen(model: session).id(session.generation)
                } label: {
                    SetupRow(
                        title: "Cooking preferences", configured: model.status?.cookingConfigured)
                }
            } header: {
                Text("For both of you")
            } footer: {
                Text("Shared cooking notes and meal slots. Existing household choices are reused.")
            }
            Section("Your iPhone") {
                NavigationLink {
                    CalendarScreen(member: member, session: session).id(session.generation)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Calendars and busy sharing")
                    }.padding(.vertical, 4)
                }
                Text("Choose calendars on this iPhone. Personal details stay here; busy sharing is a separate opt-in.")
                    .font(.footnote).foregroundStyle(NestColor.ink2)
                NavigationLink {
                    NotificationPreferencesScreen(session: session, member: member).id(session.generation)
                } label: {
                    SetupRow(
                        title: "Notification choices", configured: model.status?.notificationsConfigured
                    )
                }
                Text("Your daily summary and item reminders. Connect this iPhone separately if delivery is available.")
                    .font(.footnote).foregroundStyle(NestColor.ink2)
            }
            Section {
                if model.loading { ProgressView("Checking saved choices…") }
                if let notice = model.notice { Text(notice).foregroundStyle(NestColor.ink2) }
                Button("Reload saved choices") { load() }.disabled(model.loading)
                Button("Get started") {
                    if let getStarted { getStarted() } else { dismiss() }
                }
                Text("You can finish any of these later from Profile.")
                    .font(.footnote).foregroundStyle(NestColor.ink2)
            }
        }
        .scrollContentBackground(.hidden).background(QuietPalette.background).tint(QuietPalette.accent)
        .navigationTitle("Your setup").navigationBarTitleDisplayMode(.inline)
        .task { await model.load(session: session, member: member) }
        .onDisappear { model.clear() }
        .onChange(of: session.generation) { model.clear() }
        .onChange(of: scenePhase) { if scenePhase == .active { load() } else { model.clear() } }
    }

    private func load() { Task { await model.load(session: session, member: member) } }
}

private struct SetupRow: View {
    let title: String
    let configured: Bool?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
            Text(configured.map { $0 ? "Choices saved" : "Not chosen yet" } ?? "Not checked")
                .font(.caption.weight(.medium)).foregroundStyle(QuietPalette.accent)
        }.padding(.vertical, 4)
    }
}
