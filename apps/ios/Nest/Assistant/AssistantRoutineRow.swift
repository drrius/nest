import SwiftUI

struct AssistantRoutineRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let receipt: RoutineCreateReceipt

    var body: some View {
        Text(confirmation).foregroundStyle(QuietPalette.ink)
        NavigationLink {
            AssistantRoutineDestination(session: session, member: member, receipt: receipt).id(session.generation)
        } label: {
            Text("View current chore").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    private var confirmation: String {
        switch receipt.action {
        case "create": "Chore creation confirmed."
        case "edit": "Chore edit confirmed."
        case "pause": "Chore pause confirmed."
        case "resume": "Chore resume confirmed."
        case "archive": "Chore archive confirmed. History is kept."
        default: "Chore change confirmed."
        }
    }
}
