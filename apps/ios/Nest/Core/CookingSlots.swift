import Foundation

public struct CookingSlotsEnvelope: Decodable, Sendable {
    public struct Profile: Decodable, Sendable {
        public struct Preferences: Decodable, Sendable {
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
            profile.preferences.cookingNotes.count <= 2_000,
            !slots.isEmpty, slots.count <= 3, Set(slots).count == slots.count
        else { throw MealContractError.invalidWeek }
        return slots
    }
}
