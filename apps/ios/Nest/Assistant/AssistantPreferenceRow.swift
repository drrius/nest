import SwiftUI

struct AssistantPreferenceRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantPreferenceLink

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
        case .food: FoodPreferencesScreen(model: session).id(session.generation)
        case .cooking: CookingPreferencesScreen(model: session).id(session.generation)
        case .notifications: NotificationPreferencesScreen(session: session, member: member).id(session.generation)
        case .removedMemory: PrivateMemoryScreen(session: session, member: member).id(session.generation)
        }
    }

    private var label: String {
        switch result {
        case .food: "Review your food preferences"
        case .cooking: "Review household cooking preferences"
        case .notifications: "Review your notification choices"
        case .removedMemory: "Review your current private memories"
        }
    }

    private var confirmation: String {
        switch result {
        case .food: "Your food preference save was recorded."
        case .cooking: "Household cooking preference save was recorded."
        case .notifications: "Your notification choices were saved. This does not confirm permission or delivery."
        case .removedMemory: "Private memory removal was recorded. Conversation and approval history remain separate."
        }
    }
}
