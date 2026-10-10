import SwiftUI

struct MealLeftoversStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealLeftovers

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Leftovers from \(saved.meal.title)").font(.headline)
            Text(
                "To \(MealWeekScreen.label(saved.placement.command.date)), \(saved.placement.command.slot.label.lowercased())"
            )
            .font(.subheadline).foregroundStyle(QuietPalette.muted)
            switch saved.state {
            case .pending:
                Text("This request is saved on this iPhone. Retry to confirm it without adding leftovers twice.")
                Button("Retry leftovers") { Task { await model.retryMealLeftovers() } }
            case .acknowledged:
                Text("Your leftovers were added. Refresh both weeks to see the confirmed result.")
                Button("Refresh both weeks") { Task { await model.retryMealLeftovers() } }
            case .conflict:
                Text(
                    "A week changed and these leftovers were rejected. Discard it, then choose again from the current plan."
                )
                Button("Discard rejected request") { Task { await model.discardConflictedMealLeftovers() } }
            }
        }
        .disabled(model.mealLeftoversSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
