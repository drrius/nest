import Foundation

public struct HouseholdRoutine: Codable, Equatable, Identifiable, Sendable {
    public enum State: String, Codable, Sendable { case active, paused, archived }
    public let routineId: UUID
    public let version: String
    public let definition: CreateRoutine.Definition
    public let state: State
    public var id: UUID { routineId }

    func validated(roster: RoutineRoster) throws -> Self {
        let title = definition.title
        guard !title.isEmpty, title.unicodeScalars.count <= 120, !title.contains("\0"),
            ApprovalTime.date(version) != nil, roster.contains(definition.assignment)
        else { throw ChoreContractError.invalidSnapshot }
        _ = try definition.schedule.validated()
        return self
    }
}

public struct RoutineList: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let routines: [HouseholdRoutine]
    public let members: [NestMember]

    public func validated(member: VerifiedMember) throws -> Self {
        let roster = try RoutineRoster(version: version, householdId: householdId, members: members).validated(
            member: member)
        guard routines.count <= 200, Set(routines.map(\.id)).count == routines.count else {
            throw ChoreContractError.invalidSnapshot
        }
        for routine in routines { _ = try routine.validated(roster: roster) }
        return self
    }
}

extension ChoreAPI {
    public func routines(token: String, member: VerifiedMember) async throws -> RoutineList {
        let result = try await http.read(
            "v1/routines", token: token, household: member.householdId, as: RoutineList.self)
        return try result.validated(member: member)
    }
}
