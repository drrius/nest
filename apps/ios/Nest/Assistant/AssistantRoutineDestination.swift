import SwiftUI

struct AssistantRoutineDestination: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let receipt: RoutineCreateReceipt
    @StateObject private var detail = AssistantRoutineModel()

    var body: some View {
        Group {
            if session.status == .ready(member) { content }
        }
        .background(QuietPalette.background).navigationTitle("Current chore")
        .task { await detail.load(session: session, member: member, receipt: receipt) }
        .onDisappear { detail.invalidate() }
    }

    @ViewBuilder
    private var content: some View {
        switch detail.status {
        case .idle, .loading:
            ProgressView("Loading current chore…")
        case .failed:
            VStack(alignment: .leading, spacing: 16) {
                Text("Could not load this chore's current state. Try again online.")
                    .foregroundStyle(QuietPalette.muted)
                Button {
                    Task { await detail.load(session: session, member: member, receipt: receipt) }
                } label: {
                    Text("Try again").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        .contentShape(Rectangle())
                }
            }.padding(20)
        case .loaded(let routine):
            if let routine {
                RoutineStateScreen(model: session, routine: routine)
            } else {
                List {
                    Text("This chore is no longer in the active household list. Its history is kept.")
                        .foregroundStyle(QuietPalette.muted)
                    NavigationLink {
                        RoutinesScreen(model: session).id(session.generation)
                    } label: {
                        Text("Open household chores").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                }.scrollContentBackground(.hidden)
            }
        }
    }
}
