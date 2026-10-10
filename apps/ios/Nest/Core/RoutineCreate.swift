import Foundation

public enum RoutineAssignment: Equatable, Sendable, Codable {
    case shared
    case assigned(UUID)
    case alternating(UUID)

    private enum Keys: String, CodingKey { case policy, memberId, anchorMemberId }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: Keys.self)
        switch try values.decode(String.self, forKey: .policy) {
        case "shared": self = .shared
        case "assigned": self = .assigned(try values.decode(UUID.self, forKey: .memberId))
        case "alternating": self = .alternating(try values.decode(UUID.self, forKey: .anchorMemberId))
        default: throw ChoreContractError.invalidSnapshot
        }
    }

    public func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: Keys.self)
        switch self {
        case .shared: try values.encode("shared", forKey: .policy)
        case .assigned(let member):
            try values.encode("assigned", forKey: .policy)
            try values.encode(member, forKey: .memberId)
        case .alternating(let member):
            try values.encode("alternating", forKey: .policy)
            try values.encode(member, forKey: .anchorMemberId)
        }
    }
}

public struct CreateRoutine: Codable, Equatable, Sendable {
    public struct Definition: Codable, Equatable, Sendable {
        public let title: String
        public let schedule: RoutineSchedule
        public let assignment: RoutineAssignment
    }
    public let operationId: UUID
    public let definition: Definition

    public init(operationId: UUID, title: String, schedule: RoutineSchedule, assignment: RoutineAssignment) throws {
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
            title.utf16.count <= 120, !title.contains("\0")
        else { throw ChoreContractError.invalidSnapshot }
        self.operationId = operationId
        self.definition = Definition(title: title, schedule: try schedule.validated(), assignment: assignment)
    }

    public func validated() throws -> Self {
        try CreateRoutine(
            operationId: operationId, title: definition.title,
            schedule: definition.schedule, assignment: definition.assignment)
    }
}

public struct RoutineCreateReceipt: Codable, Equatable, Sendable {
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let routineId: UUID
    public let version: String
    public let action: String

    public func validated(member: VerifiedMember, command: CreateRoutine) throws -> Self {
        guard actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, action == "create", ApprovalTime.date(version) != nil
        else { throw ChoreContractError.invalidReceipt }
        return self
    }
}

struct RoutineCreateEnvelope: Decodable {
    let version: Int
    let receipt: RoutineCreateReceipt
}

extension ChoreAPI {
    public func createRoutine(token: String, member: VerifiedMember, command: CreateRoutine) async throws
        -> RoutineCreateReceipt
    {
        let result = try await http.write(
            "v1/routines/create", token: token, household: member.householdId,
            body: command.validated(), as: RoutineCreateEnvelope.self)
        guard result.version == 1 else { throw ChoreContractError.invalidReceipt }
        return try result.receipt.validated(member: member, command: command)
    }
}
