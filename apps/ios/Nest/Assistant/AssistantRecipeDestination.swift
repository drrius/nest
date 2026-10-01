import SwiftUI

struct AssistantRecipeDestination: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantRecipeLink
    @State private var ready = false
    @State private var failed = false

    var body: some View {
        Group {
            if ready {
                if result.action == .saved {
                    SavedRecipeScreen(model: session, id: result.definitionId)
                } else {
                    MealLibraryScreen(model: session)
                }
            } else if failed {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Could not load current saved meals. Try again online.")
                        .foregroundStyle(QuietPalette.muted)
                    Button {
                        Task { await load() }
                    } label: {
                        Text("Try again").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                }
                .padding(20)
            } else {
                ProgressView("Loading current saved meals…")
            }
        }
        .background(QuietPalette.background)
        .task { await load() }
    }

    private func load() async {
        ready = false
        failed = false
        let success = await session.refreshAssistantRecipeLibrary(
            definition: result.action == .saved ? result.definitionId : nil, member: member)
        guard !Task.isCancelled, session.status == .ready(member) else { return }
        ready = success
        failed = !success
    }
}
