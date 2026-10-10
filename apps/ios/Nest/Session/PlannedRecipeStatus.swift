import Foundation

struct PlannedRecipeTarget: Equatable, Hashable {
    let start: MealWeekStart
    let id: UUID
}

enum PlannedRecipeStatus: Equatable {
    case idle, loading
    case loaded(PlannedRecipeEnvelope)
    case failed
}
