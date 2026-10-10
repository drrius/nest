import Foundation

public struct MealPreparation: Codable, Equatable, Sendable {
    public enum Status: String, Codable, Sendable { case open, completed, skipped }
    public enum State: String, Codable, Sendable { case active, paused, archived }
    public let routineId: UUID
    public let occurrenceId: UUID
    public let routineVersion: String
    public let title: String
    public let instructions: String?
    public let dueOn: CivilDate
    public let assignment: RoutineAssignment
    public let plannedAssigneeId: UUID?
    public let status: Status
    public let state: State

    func validated() throws -> Self {
        guard ApprovalTime.date(routineVersion) != nil,
            !title.isEmpty, title.unicodeScalars.count <= 120, !title.contains("\0"),
            instructions.map({ $0.unicodeScalars.count <= 4000 && !$0.contains("\0") }) ?? true
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct MealPreparationEnvelope: Codable, Equatable, Sendable {
    public struct Entry: Codable, Equatable, Sendable {
        public let entryId: UUID
        public let date: CivilDate
        public let title: String
    }
    public let version: Int
    public let householdId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let entryId: UUID
    public let entry: Entry?
    public let preparation: MealPreparation?

    func validated(household: UUID, week: MealWeekStart, id: UUID, revision expected: String? = nil) throws -> Self {
        guard version == 1, householdId == household, weekStart == week, entryId == id,
            MealRevision.valid(revision), expected == nil || revision == expected
        else { throw MealContractError.invalidPlacement }
        if let entry {
            guard entry.entryId == id, week.days.contains(entry.date), MealLibraryText.validTitle(entry.title)
            else { throw MealContractError.invalidPlacement }
            _ = try preparation?.validated()
        } else if preparation != nil {
            throw MealContractError.invalidPlacement
        }
        return self
    }
}

public struct MealPreparationDraft: Codable, Equatable, Sendable {
    public let title: String
    public let instructions: String?
    public let dueOn: CivilDate
    public let assignment: RoutineAssignment

    enum CodingKeys: String, CodingKey { case title, instructions, dueOn, assignment }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(title, forKey: .title)
        try values.encode(instructions, forKey: .instructions)
        try values.encode(dueOn, forKey: .dueOn)
        try values.encode(assignment, forKey: .assignment)
    }

    func validated() throws -> Self {
        guard Self.validTitle(title), Self.validInstructions(instructions) else {
            throw MealContractError.invalidPlacement
        }
        return self
    }

    static func validTitle(_ value: String) -> Bool {
        !value.trimmingCharacters(in: titleWhitespace).isEmpty
            && value.utf16.count <= 120 && !value.contains("\0")
    }

    // Match the Effect/SQL command's ECMAScript trim, including BOM and excluding NEL.
    private static let titleWhitespace = CharacterSet(
        charactersIn:
            "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}"
    )

    static func validInstructions(_ value: String?) -> Bool {
        value.map { $0.utf16.count <= 4000 && !$0.contains("\0") } ?? true
    }
}
