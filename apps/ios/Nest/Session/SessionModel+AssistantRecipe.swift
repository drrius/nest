import Foundation

extension SessionModel {
    func refreshAssistantRecipeLibrary(definition: UUID?, member: VerifiedMember) async -> Bool {
        guard status == .ready(member), !Task.isCancelled else { return false }
        let attempt = generation
        await refreshMealLibrary()
        while generation == attempt, status == .ready(member), !Task.isCancelled {
            guard case .loaded(let listing) = mealLibrary, mealLibraryFresh else { return false }
            guard let definition, !listing.meals.contains(where: { $0.id == definition }),
                let cursor = listing.nextAfterId
            else { return true }
            await loadNextMealLibraryPage()
            guard case .loaded(let next) = mealLibrary, next.nextAfterId != cursor else { return false }
        }
        return false
    }
}
