import SwiftUI

struct AssistantMealActionRow: View {
    @ObservedObject var session: SessionModel
    let result: AssistantMealActionLink

    var body: some View {
        Text(confirmation).foregroundStyle(QuietPalette.ink)
        NavigationLink {
            PlannedRecipeScreen(
                model: session,
                target: PlannedRecipeTarget(start: result.weekStart, id: result.entryId)
            )
            .id(session.generation)
        } label: {
            Text(result.action == .removed ? "Check current meal status" : "View current planned meal")
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }

    private var confirmation: String {
        switch result.action {
        case .placed: "One-off meal added."
        case .savedRecipe: "Saved recipe added to the plan."
        case .replaced: "Meal replaced with a one-off meal."
        case .moved: "Meal moved."
        case .leftovers: "Leftovers planned."
        case .removed: "Meal removal confirmed."
        }
    }
}
