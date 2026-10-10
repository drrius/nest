import SwiftUI

struct MealRecipeReplacementStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealRecipeReplacement

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Replacing \(saved.meal.title)").font(.headline)
            Text("With \(saved.recipe.title)").foregroundStyle(QuietPalette.muted)
            switch saved.state {
            case .pending:
                Text("This request is saved on this iPhone. Retry it to confirm the same replacement.")
                Button("Retry saved recipe replacement") { Task { await model.retryMealRecipeReplacement() } }
                    .frame(minHeight: 44)
            case .acknowledged:
                Text("Your replacement was accepted. Refresh to check the current plan and retained recipe.")
                Button("Refresh replaced recipe") { Task { await model.retryMealRecipeReplacement() } }
                    .frame(minHeight: 44)
            case .conflict:
                Text("This replacement was rejected. Discard the request, then review the current week and library.")
                Button("Discard rejected recipe replacement") {
                    Task { await model.discardConflictedMealRecipeReplacement() }
                }
                .frame(minHeight: 44)
            }
        }
        .disabled(model.mealRecipeReplacementSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
