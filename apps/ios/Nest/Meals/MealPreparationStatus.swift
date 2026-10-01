import SwiftUI

struct MealPreparationStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealPreparation

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Preparation · \(saved.baseline.entry?.title ?? "Removed meal")").font(.headline)
            Text(MealWeekScreen.label(saved.baseline.weekStart.date)).font(.caption)
            switch saved.state {
            case .pending:
                Text("Your request is saved on this iPhone. Retry the same request to check whether it reached Nest.")
                Button("Retry preparation save") { Task { await model.retryMealPreparation() } }
            case .acknowledged:
                Text("Nest confirmed this save. Refresh to check the current preparation.")
                Button("Refresh confirmed preparation") { Task { await model.retryMealPreparation() } }
            case .conflict:
                Text("This request was rejected. Discard it before editing the current preparation.")
                Button("Discard rejected preparation") { Task { await model.discardPreparationConflict() } }
            }
        }
        .disabled(model.mealPreparationSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
