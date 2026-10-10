import Foundation

public struct FoodPreferences: Codable, Equatable, Sendable {
    public var restrictions: [String]
    public var dislikes: [String]
    public var calorieGoal: Int?
    public var portions: Double

    enum CodingKeys: String, CodingKey { case restrictions, dislikes, calorieGoal, portions }

    public func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        try fields.encode(restrictions, forKey: .restrictions)
        try fields.encode(dislikes, forKey: .dislikes)
        try fields.encode(calorieGoal, forKey: .calorieGoal)
        try fields.encode(portions, forKey: .portions)
    }

    func validated() throws -> Self {
        guard restrictions.count <= 32, dislikes.count <= 32,
            (restrictions + dislikes).allSatisfy(Self.validText),
            calorieGoal.map({ (1...20000).contains($0) }) ?? true,
            [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4].contains(portions)
        else { throw FoodPreferenceError.invalidPreferences }
        return self
    }

    private static func validText(_ value: String) -> Bool {
        // Match ECMAScript trim rather than Foundation's different whitespace set.
        let whitespace = CharacterSet(
            charactersIn:
                "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}"
        )
        return value.utf16.count <= 120 && !value.trimmingCharacters(in: whitespace).isEmpty
    }
}

public enum FoodPreferenceError: Error { case invalidPreferences, invalidResponse }

public struct FoodProfile: Codable, Equatable, Sendable {
    public let revision: String
    public let preferences: FoodPreferences
}

public struct FoodProfileEnvelope: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let profile: FoodProfile?

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId
        else { throw FoodPreferenceError.invalidResponse }
        if let profile {
            guard MealRevision.valid(profile.revision) else { throw FoodPreferenceError.invalidResponse }
            _ = try profile.preferences.validated()
        }
        return self
    }
}

public struct SaveFoodPreferences: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let expectedRevision: String
    public let preferences: FoodPreferences

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max
        else { throw FoodPreferenceError.invalidPreferences }
        _ = try preferences.validated()
        return self
    }
}

public struct FoodPreferenceReceipt: Codable, Equatable, Sendable {
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let revision: String

    func validated(member: VerifiedMember, command: SaveFoodPreferences) throws -> Self {
        _ = try command.validated()
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, let previous = Int64(command.expectedRevision),
            revision == String(previous + 1)
        else { throw FoodPreferenceError.invalidResponse }
        return self
    }
}
