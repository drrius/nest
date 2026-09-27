import SwiftUI

struct MealRemovalStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealRemoval

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(saved.meal.title).font(.headline).foregroundStyle(QuietPalette.ink)
            Text("\(saved.meal.slot.label) · \(saved.meal.date.value)")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
            Text(statusText).font(.subheadline).foregroundStyle(QuietPalette.muted)
            if saved.state == .pending {
                Button("Retry saved removal") { Task { await model.retryMealRemoval() } }
                    .disabled(model.mealRemovalSaving)
                    .frame(minHeight: 44, alignment: .leading)
            }
            if saved.state == .conflict {
                Button("Discard rejected removal") {
                    Task { await model.discardConflictedMealRemoval() }
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
        case .acknowledged: "Removed. Refreshing the shared week."
        case .conflict: "The week changed. Review the current meal before trying again."
        }
    }
}
