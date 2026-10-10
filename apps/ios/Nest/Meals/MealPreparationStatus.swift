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
                PreparationRecoveryButton(title: "Retry preparation save") {
                    Task { await model.retryMealPreparation() }
                }
            case .acknowledged:
                Text("Nest confirmed this save. Refresh to check the current preparation.")
                PreparationRecoveryButton(title: "Refresh confirmed preparation") {
                    Task { await model.retryMealPreparation() }
                }
            case .conflict:
                Text("This request was rejected. Discard it before editing the current preparation.")
                PreparationRecoveryButton(title: "Discard rejected preparation") {
                    Task { await model.discardPreparationConflict() }
                }
            }
        }
        .disabled(model.mealPreparationSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}

private struct PreparationRecoveryButton: View {
    let title: String
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(title).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(Rectangle())
        }
    }
}
