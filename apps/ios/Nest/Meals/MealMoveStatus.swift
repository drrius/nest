import SwiftUI

struct MealMoveStatus: View {
    @ObservedObject var model: SessionModel
    let saved: SavedMealMove

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Moving \(saved.meal.title)").font(.headline)
            Text("To \(MealWeekScreen.label(saved.command.date)), \(saved.command.slot.label.lowercased())")
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
            switch saved.state {
            case .pending:
                Text("This move is saved on this iPhone. Retry to confirm it without creating another move.")
                Button("Retry move") { Task { await model.retryMealMove() } }
            case .acknowledged:
                Text("Your move was accepted. Refresh both weeks to see the confirmed result.")
                Button("Refresh both weeks") { Task { await model.retryMealMove() } }
            case .conflict:
                Text("A week changed and this move was rejected. Discard it, then choose again from the current plan.")
                Button("Discard rejected move") { Task { await model.discardConflictedMealMove() } }
            }
        }
        .disabled(model.mealMoveSaving)
        .padding(16)
        .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 18))
    }
}
