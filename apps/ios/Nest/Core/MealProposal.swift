import Foundation

public enum ProposedMealSource: Codable, Equatable, Sendable {
    case saved(libraryRevision: String, recipe: SavedRecipe)
    case suggested(RecipeDraft)

    enum CodingKeys: String, CodingKey { case kind, libraryRevision, recipe }
    enum Kind: String, Codable { case saved, suggested }

    public init(from decoder: Decoder) throws {
        let fields = try decoder.container(keyedBy: CodingKeys.self)
        switch try fields.decode(Kind.self, forKey: .kind) {
        case .saved:
            self = .saved(
                libraryRevision: try fields.decode(String.self, forKey: .libraryRevision),
                recipe: try fields.decode(SavedRecipe.self, forKey: .recipe))
        case .suggested: self = .suggested(try fields.decode(RecipeDraft.self, forKey: .recipe))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var fields = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .saved(let revision, let recipe):
            try fields.encode(Kind.saved, forKey: .kind)
            try fields.encode(revision, forKey: .libraryRevision)
            try fields.encode(recipe, forKey: .recipe)
        case .suggested(let recipe):
            try fields.encode(Kind.suggested, forKey: .kind)
            try fields.encode(recipe, forKey: .recipe)
        }
    }

    var isSaved: Bool {
        if case .saved = self { return true }
        return false
    }

    func validate() throws {
        switch self {
        case .saved(let revision, let recipe):
            guard MealRevision.valid(revision) else { throw MealProposalError.invalidResponse }
            _ = try recipe.validated()
        case .suggested(let recipe): _ = try recipe.validated()
        }
    }
}

public struct ProposedMeal: Codable, Equatable, Identifiable, Sendable {
    public let entryId: UUID
    public let date: CivilDate
    public let slot: MealSlot
    public let source: ProposedMealSource
    public let estimatedCaloriesPerServing: Int?
    public var id: UUID { entryId }
}

public enum MealProposalError: Error { case invalidResponse }

public struct MealProposal: Codable, Equatable, Identifiable, Sendable {
    public enum Status: String, Codable, Sendable { case generating, ready, failed, approved, discarded }
    public enum Failure: String, Codable, Sendable {
        case unavailable
        case constraintsChanged = "constraints_changed"
        case incompletePreferences = "incomplete_preferences"
        case noSuitableMeals = "no_suitable_meals"
    }
    public let proposalId: UUID
    public let revision: String
    public let weekRevision: String
    public let weekStart: MealWeekStart
    public let familiarOnly: Bool
    public let entries: [ProposedMeal]?
    public let status: Status
    public let expiresAt: Int64
    public let failure: Failure?
    public var id: UUID { proposalId }

    func validated() throws -> Self {
        guard MealRevision.valid(revision), revision != "0", MealRevision.valid(weekRevision),
            (1...253_402_300_799_999).contains(expiresAt), (status == .failed) == (failure != nil)
        else { throw MealProposalError.invalidResponse }
        if let entries {
            guard status != .generating, status != .failed else { throw MealProposalError.invalidResponse }
            try validateEntries(entries)
        } else {
            guard [.generating, .failed, .discarded].contains(status) else { throw MealProposalError.invalidResponse }
        }
        return self
    }

    private func validateEntries(_ entries: [ProposedMeal]) throws {
        guard (1...21).contains(entries.count), Set(entries.map(\.id)).count == entries.count,
            Set(entries.map { "\($0.date.value):\($0.slot.rawValue)" }).count == entries.count
        else { throw MealProposalError.invalidResponse }
        for entry in entries {
            guard weekStart.days.contains(entry.date), !familiarOnly || entry.source.isSaved,
                entry.estimatedCaloriesPerServing.map({ (1...20000).contains($0) }) ?? true
            else { throw MealProposalError.invalidResponse }
            try entry.source.validate()
        }
    }
}

public struct MealProposalEnvelope: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let proposal: MealProposal

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId, proposal.id == id
        else { throw MealProposalError.invalidResponse }
        _ = try proposal.validated()
        return self
    }
}
