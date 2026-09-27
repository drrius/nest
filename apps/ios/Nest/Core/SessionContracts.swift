import Foundation

public struct VerifiedMember: Decodable, Equatable, Sendable {
    public let userId: UUID
    public let householdId: UUID
    public let displayName: String
}

public struct VerifiedSession: Decodable, Sendable {
    public let version: Int
    public let member: VerifiedMember

    public func validated(actor: UUID) throws -> VerifiedMember {
        guard version == 1, member.userId == actor else { throw NestAPIFailure.contract }
        return member
    }
}
