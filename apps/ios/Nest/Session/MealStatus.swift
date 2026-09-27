enum MealStatus: Equatable {
    case idle, loading
    case loaded(MealWeekSnapshot)
    case failed
}
