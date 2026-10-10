import SwiftUI

struct MealPlacementStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealPlacement

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(saved.command.title).font(.headline).foregroundStyle(QuietPalette.ink)
            Text("\(saved.command.slot.label) · \(saved.command.date.value)")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
            Text(statusText).font(.subheadline).foregroundStyle(QuietPalette.muted)
            if saved.state == .pending {
                Button("Retry saved meal") { Task { await model.retryMealPlacement() } }
                    .disabled(model.mealPlacementSaving)
                    .frame(minHeight: 44, alignment: .leading)
            }
            if saved.state == .conflict {
                Button("Discard rejected meal") {
                    Task { await model.discardConflictedMealPlacement() }
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
        case .acknowledged: "Saved. Refreshing the shared week."
        case .conflict: "The week changed. Review the current slot before trying again."
        }
    }
}
