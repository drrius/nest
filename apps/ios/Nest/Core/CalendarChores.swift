import Foundation

struct CalendarChore: Codable, Identifiable, Sendable {
    enum Role: String, Codable { case current, preview }
    let occurrenceId: UUID
    let routineId: UUID
    let title: String
    let dueDate: CivilDate
    let assigneeId: UUID?
    let offlineEpoch: UUID?
    let role: Role
    var id: UUID { occurrenceId }
}

struct CalendarChores: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let date: CivilDate
    let chores: [CalendarChore]

    func validated(household: UUID, day: CivilDate) throws -> Self {
        guard version == 1, householdId == household, date == day, chores.count <= 200,
            Set(chores.map(\.id)).count == chores.count,
            chores.allSatisfy({ !$0.title.isEmpty && $0.dueDate == day })
        else {
            throw ChoreContractError.invalidSnapshot
        }
        return self
    }
}

extension CalendarAPI {
    func chores(token: String, member: VerifiedMember, day: CivilDate) async throws -> CalendarChores {
        let response = try await http.read(
            "v1/calendar/chores?date=\(day.value)", token: token, household: member.householdId, as: CalendarChores.self
        )
        return try response.validated(household: member.householdId, day: day)
    }
}
