import Foundation

public struct CookingSlotsEnvelope: Codable, Equatable, Sendable {
    public struct Profile: Codable, Equatable, Sendable {
        public struct Preferences: Codable, Equatable, Sendable {
            public let cookingNotes: String
            public let mealSlots: [MealSlot]
        }
        public let revision: String
        public let preferences: Preferences
    }
    public let version: Int
    public let householdId: UUID
    public let profile: Profile?

    public func validated(household: UUID) throws -> [MealSlot] {
        guard version == 1, householdId == household else { throw MealContractError.invalidWeek }
        guard let profile else { return MealSlot.allCases }
        let slots = profile.preferences.mealSlots
        guard MealRevision.valid(profile.revision), profile.revision != "0",
            profile.preferences.cookingNotes.utf16.count <= 2_000,
            !slots.isEmpty, slots.count <= 3, Set(slots).count == slots.count
        else { throw MealContractError.invalidWeek }
        return slots
    }
}
