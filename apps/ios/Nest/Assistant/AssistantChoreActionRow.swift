import SwiftUI

struct AssistantChoreActionRow: View {
    @ObservedObject var session: SessionModel
    let result: AssistantChoreActionLink

    var body: some View {
        Text(confirmation).foregroundStyle(QuietPalette.ink)
        NavigationLink {
            destination
        } label: {
            Text(label).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    @ViewBuilder
    private var destination: some View {
        switch result {
        case .completion(let receipt):
            ChoreOccurrencesScreen(model: session, recordedCompletion: receipt).id(session.generation)
        case .change:
            ChoreOccurrencesScreen(model: session).id(session.generation)
        case .transfer:
            ChoreHandoversScreen(model: session).id(session.generation)
        }
    }

    private var label: String {
        if case .transfer = result { return "View current chore handovers" }
        return "View current scheduled chores"
    }

    private var confirmation: String {
        switch result {
        case .completion(let receipt):
            receipt.outcome == .completed ? "Chore completion recorded." : "This chore was already completed."
        case .change(let receipt):
            receipt.action == "skip" ? "Chore skip recorded." : "Chore date change recorded."
        case .transfer(let receipt):
            switch receipt.action {
            case "request": "Handover request recorded. Your partner's decision is separate."
            case "accept": "Handover acceptance recorded for this occurrence."
            default: "Handover decline recorded."
            }
        }
    }
}
