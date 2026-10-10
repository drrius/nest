import Foundation

struct CalendarRenewal: Codable, Equatable, Identifiable, Sendable {
    struct Fields: Codable, Equatable, Sendable {
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
        guard !removed, (try? validated()) != nil,
            fields.renewalOn == day || cancellationOn == day
        else { return false }
        return true
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
