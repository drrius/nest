import SwiftUI

struct AssistantMealRecipeReplacementRow: View {
    @ObservedObject var session: SessionModel
    let result: MealRecipeReplacementReceipt

    var body: some View {
        Text("Meal replaced with the selected saved recipe.")
            .foregroundStyle(QuietPalette.ink)
        NavigationLink {
            PlannedRecipeScreen(
                model: session, target: PlannedRecipeTarget(start: result.weekStart, id: result.entryId)
            )
            .id(session.generation)
        } label: {
            Text("View current planned recipe")
                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                .contentShape(Rectangle())
        }
    }
}
