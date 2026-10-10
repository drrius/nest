import SwiftUI

struct MealReplacementStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealReplacement

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Replacing \(saved.meal.title)").font(.headline)
            Text("With \(saved.command.title)")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
            switch saved.state {
            case .pending:
                Text(
                    "This replacement is saved on this iPhone. Retry to confirm it without creating another replacement."
                )
                Button("Retry replacement") { Task { await model.retryMealReplacement() } }
            case .acknowledged:
                Text("Your replacement was accepted. Refresh the week to see the confirmed result.")
                Button("Refresh the week") { Task { await model.retryMealReplacement() } }
            case .conflict:
                Text(
                    "A week changed and this replacement was rejected. Discard it, then choose again from the current plan."
                )
                Button("Discard rejected replacement") { Task { await model.discardConflictedMealReplacement() } }
            }
        }
        .disabled(model.mealReplacementSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
