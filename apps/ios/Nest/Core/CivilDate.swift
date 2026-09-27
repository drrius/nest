import Foundation

public struct CivilDate: Codable, Equatable, Hashable, Sendable {
    public let value: String

    public init(_ value: String) throws {
        let parts = value.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 3,
            parts[0].count == 4, parts[1].count == 2, parts[2].count == 2,
            let year = Int(parts[0]), let month = Int(parts[1]), let day = Int(parts[2]),
            year > 0, value.utf8.allSatisfy({ $0 == 45 || (48...57).contains($0) })
        else { throw CivilDateError.invalid }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let components = DateComponents(year: year, month: month, day: day)
        guard let date = calendar.date(from: components),
            calendar.dateComponents([.year, .month, .day], from: date) == components
        else { throw CivilDateError.invalid }
        self.value = value
    }

    public init(from decoder: Decoder) throws {
        let value = try decoder.singleValueContainer().decode(String.self)
        do { try self.init(value) } catch {
            throw DecodingError.dataCorrupted(
                .init(codingPath: decoder.codingPath, debugDescription: "Invalid calendar date"))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(value)
    }
}

public enum CivilDateError: Error { case invalid }
