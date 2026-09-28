import Foundation

struct CalendarRenewal: Codable, Identifiable, Sendable {
    struct Fields: Codable, Sendable {
        let title: String
        let renewalOn: CivilDate
        let noticeDays: Int
        let responsibleId: UUID?
        let recurringRuleId: UUID?
    }
    let renewalId: UUID
    let revision: UUID
    let fields: Fields
    let cancellationOn: CivilDate
    let removed: Bool
    var id: UUID { renewalId }

    func valid(on day: CivilDate) -> Bool {
        guard !removed, (0...730).contains(fields.noticeDays),
            (1...160).contains(fields.title.trimmingCharacters(in: .init(charactersIn: " ")).unicodeScalars.count),
            fields.renewalOn == day || cancellationOn == day
        else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let parts = fields.renewalOn.value.split(separator: "-").compactMap { Int($0) }
        guard let renewal = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
            let deadline = calendar.date(byAdding: .day, value: -fields.noticeDays, to: renewal)
        else { return false }
        let components = calendar.dateComponents([.year, .month, .day], from: deadline)
        let expected = String(format: "%04d-%02d-%02d", components.year!, components.month!, components.day!)
        return cancellationOn.value == expected
    }
}

struct CalendarRenewals: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let date: CivilDate
    let after: UUID?
    let next: UUID?
    let renewals: [CalendarRenewal]

    func validated(household: UUID, day: CivilDate, cursor: UUID?) throws -> Self {
        guard version == 1, householdId == household, date == day, after == cursor, renewals.count <= 50 else {
            throw ChoreContractError.invalidSnapshot
        }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for renewal in renewals {
            let identity = renewal.id.uuidString.lowercased()
            guard identity > previous, renewal.valid(on: day) else { throw ChoreContractError.invalidSnapshot }
            previous = identity
        }
        guard next == nil || (renewals.count == 50 && next == renewals.last?.id) else {
            throw ChoreContractError.invalidSnapshot
        }
        return self
    }
}

extension CalendarAPI {
    func renewals(token: String, member: VerifiedMember, day: CivilDate, after: UUID?) async throws -> CalendarRenewals
    {
        let cursor = after.map { "&after=\($0.uuidString.lowercased())" } ?? ""
        let response = try await http.read(
            "v1/calendar/renewals?date=\(day.value)\(cursor)", token: token,
            household: member.householdId, as: CalendarRenewals.self)
        return try response.validated(household: member.householdId, day: day, cursor: after)
    }
}
