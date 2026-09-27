import SwiftUI

struct MealRecipePlacementStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealRecipePlacement

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(saved.recipe.title).font(.headline).foregroundStyle(QuietPalette.ink)
            Text("\(saved.command.slot.label) · \(saved.command.date.value)")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
            Text(statusText).font(.subheadline).foregroundStyle(QuietPalette.muted)
            if saved.state == .pending {
                Button("Retry saved meal") { Task { await model.retryMealRecipePlacement() } }
                    .disabled(model.mealRecipePlacementSaving)
                    .frame(minHeight: 44, alignment: .leading)
            }
            if saved.state == .conflict {
                Button("Discard rejected saved meal") {
                    Task { await model.discardConflictedMealRecipePlacement() }
                }
                .frame(minHeight: 44, alignment: .leading)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(QuietPalette.soft, in: RoundedRectangle(cornerRadius: 18))
    }

    private var statusText: String {
        switch saved.state {
        case .pending: "Not confirmed. Retry the same saved request when online."
        case .acknowledged: "Saved meal added. Refreshing the shared week."
        case .conflict: "The week or library changed. Review both before trying again."
        }
    }
}
