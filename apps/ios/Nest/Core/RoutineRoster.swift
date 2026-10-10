import Foundation

public struct RoutineRoster: Decodable, Sendable {
    public let version: Int
    public let householdId: UUID
    public let members: [NestMember]

    public func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, householdId == member.householdId,
            (1...2).contains(members.count), members.contains(where: { $0.actorId == member.userId }),
            Set(members.map(\.actorId)).count == members.count
        else { throw ChoreContractError.invalidSnapshot }
        return self
    }

    public func contains(_ assignment: RoutineAssignment) -> Bool {
        switch assignment {
        case .shared: true
        case .assigned(let id), .alternating(let id): members.contains { $0.actorId == id }
        }
    }
}

extension ChoreAPI {
    public func routineRoster(token: String, member: VerifiedMember) async throws -> RoutineRoster {
        let result = try await http.read(
            "v1/routines/roster", token: token, household: member.householdId, as: RoutineRoster.self)
        return try result.validated(member: member)
    }
}
