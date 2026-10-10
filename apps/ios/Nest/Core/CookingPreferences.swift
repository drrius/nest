import Foundation

public struct SaveCookingProfile: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let expectedRevision: String
    public let preferences: CookingSlotsEnvelope.Profile.Preferences

    public init(operationId: UUID, expectedRevision: String, notes: String, slots: [MealSlot]) throws {
        self.operationId = operationId
        self.expectedRevision = expectedRevision
        preferences = .init(cookingNotes: notes, mealSlots: slots)
        _ = try validated()
    }

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max,
            preferences.cookingNotes.utf16.count <= 2_000, !preferences.cookingNotes.contains("\0"),
            !preferences.mealSlots.isEmpty, preferences.mealSlots.count <= 3,
            Set(preferences.mealSlots).count == preferences.mealSlots.count
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct CookingSaveReceipt: Codable, Equatable, Sendable {
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let revision: String

    func validated(member: VerifiedMember, command: SaveCookingProfile) throws -> Self {
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId,
            let previous = Int64(command.expectedRevision), previous < Int64.max,
            revision == String(previous + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct CookingSaveEnvelope: Decodable {
    let version: Int
    let receipt: CookingSaveReceipt
}
