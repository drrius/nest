import SwiftUI

struct MealSetupPrompt: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model = SetupModel()

    var body: some View {
        Group {
            if let status = model.status, !status.foodConfigured || !status.cookingConfigured {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Make meals fit your household").font(.headline)
                    Text(
                        "Review your restrictions and shared cooking choices when you’re ready. You can keep planning without finishing setup."
                    )
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
                    NavigationLink("Review meal setup") {
                        SetupScreen(session: session, member: member).id(session.generation)
                    }.frame(minHeight: 44)
                }
                .padding(16).background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 16))
            } else if let notice = model.notice {
                VStack(alignment: .leading, spacing: 8) {
                    Text(notice).font(.footnote).foregroundStyle(QuietPalette.muted)
                    Button("Retry setup check") { Task { await model.load(session: session, member: member) } }
                }
            }
        }
        .task { await model.load(session: session, member: member) }
        .onDisappear { model.clear() }
        .onChange(of: session.generation) { model.clear() }
    }
}
