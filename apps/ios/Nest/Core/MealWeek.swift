import Foundation

public enum MealSlot: String, Codable, CaseIterable, Hashable, Sendable {
    case breakfast, lunch, dinner

    public var label: String { rawValue.capitalized }
}

public struct MealWeekStart: Codable, Equatable, Hashable, Sendable {
    public let date: CivilDate

    public init(_ value: String) throws {
        let date = try CivilDate(value)
        guard value <= "9999-12-20", Self.calendar.component(.weekday, from: Self.day(date)) == 2
        else { throw MealContractError.invalidWeek }
        self.date = date
    }

    public init(from decoder: Decoder) throws {
        try self.init(decoder.singleValueContainer().decode(String.self))
    }

    public func encode(to encoder: Encoder) throws {
        var value = encoder.singleValueContainer()
        try value.encode(date.value)
    }

    public static func current(now: Date = .now) throws -> Self {
        var calendar = Self.calendar
        calendar.timeZone = TimeZone(identifier: "Europe/Zurich")!
        let weekday = calendar.component(.weekday, from: now)
        let monday = calendar.date(byAdding: .day, value: -(weekday + 5) % 7, to: now)!
        let parts = calendar.dateComponents([.year, .month, .day], from: monday)
        return try Self(String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!))
    }

    public func adjacent(_ weeks: Int) throws -> Self {
        guard let next = Self.calendar.date(byAdding: .day, value: weeks * 7, to: Self.day(date))
        else { throw MealContractError.invalidWeek }
        return try Self(Self.string(next))
    }

    public var days: [CivilDate] {
        (0..<7).compactMap { offset in
            guard let next = Self.calendar.date(byAdding: .day, value: offset, to: Self.day(date))
            else { return nil }
            return try? CivilDate(Self.string(next))
        }
    }

    private static var calendar: Calendar {
        var value = Calendar(identifier: .gregorian)
        value.timeZone = TimeZone(secondsFromGMT: 0)!
        return value
    }

    private static func day(_ date: CivilDate) -> Date {
        let parts = date.value.split(separator: "-").compactMap { Int($0) }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))!
    }

    private static func string(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }
}

public struct PlannedMeal: Codable, Equatable, Identifiable, Sendable {
    public let entryId: UUID
    public let date: CivilDate
    public let slot: MealSlot
    public let title: String
    public let recipeUrl: String?
    public let notes: String?
    public let definitionId: UUID?
    public let leftoverSourceId: UUID?

    public var id: UUID { entryId }
}

public struct MealWeekSnapshot: Codable, Equatable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let weekStart: MealWeekStart
    public let revision: String
    public let entries: [PlannedMeal]

    public func validated(household: UUID, week: MealWeekStart) throws -> Self {
        guard version == 1, householdId == household, weekStart == week,
            MealRevision.valid(revision), entries.count <= 21,
            Set(entries.map(\.id)).count == entries.count,
            Set(entries.map { "\($0.date.value):\($0.slot.rawValue)" }).count == entries.count
        else { throw MealContractError.invalidWeek }
        let dates = Set(week.days)
        for entry in entries {
            guard dates.contains(entry.date), entry.leftoverSourceId != entry.id,
                Self.validTitle(entry.title), (entry.notes?.count ?? 0) <= 4_000,
                (entry.recipeUrl?.count ?? 0) <= 2_000
            else { throw MealContractError.invalidWeek }
        }
        return self
    }

    private static func validTitle(_ title: String) -> Bool {
        let trimmed = title.trimmingCharacters(in: .whitespaces)
        return !trimmed.isEmpty && trimmed.unicodeScalars.count <= 120 && !title.contains("\0")
    }
}

enum MealRevision {
    static func valid(_ value: String) -> Bool {
        value == "0"
            || (!value.isEmpty && value.first != "0"
                && value.allSatisfy(\.isNumber) && Int64(value) != nil)
    }
}

public enum MealContractError: Error { case invalidWeek, invalidPlacement, invalidReceipt }
