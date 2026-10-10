import SwiftUI

struct AssistantRecipeRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantRecipeLink

    var body: some View {
        switch result.action {
        case .saved:
            Text("Recipe save confirmed.").foregroundStyle(QuietPalette.ink)
            NavigationLink {
                AssistantRecipeDestination(session: session, member: member, result: result).id(session.generation)
            } label: {
                Text("View current recipe").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
        case .archived:
            Text("Recipe archive confirmed. Existing plans keep their saved recipe.").foregroundStyle(QuietPalette.ink)
            NavigationLink {
                AssistantRecipeDestination(session: session, member: member, result: result).id(session.generation)
            } label: {
                Text("View current saved meals").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
        }
    }
}
