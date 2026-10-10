import SwiftUI

struct AssistantGroceryActionRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantGroceryActionLink

    var body: some View {
        Text(confirmation).foregroundStyle(QuietPalette.ink)
        NavigationLink {
            AssistantGroceryDestination(session: session, member: member, result: result).id(session.generation)
        } label: {
            Text("View current grocery").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    private var confirmation: String {
        switch result.action {
        case .added: "Grocery add confirmed."
        case .edited: "Grocery edit confirmed."
        case .removed: "Grocery removal confirmed."
        case .checked(let checked): checked ? "Grocery check confirmed." : "Grocery marked as needed."
        }
    }
}
