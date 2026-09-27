import Foundation

public struct ChoreAPI: Sendable {
    private let http: NestHTTP

    public init(http: NestHTTP) { self.http = http }

    public func verify(token: String, expectedActor: UUID) async throws -> VerifiedMember {
        let result = try await http.read("v1/session", token: token, as: VerifiedSession.self)
        return try result.validated(actor: expectedActor)
    }

    public func snapshot(token: String, member: VerifiedMember) async throws -> ChoreSnapshot {
        let result = try await http.read(
            "v1/chores/snapshot", token: token, household: member.householdId,
            as: ChoreSnapshot.self
        )
        return try result.validated(household: member.householdId, actor: member.userId)
    }

    public func complete(
        token: String, member: VerifiedMember, command: CompleteChore
    ) async throws -> ChoreCompletion {
        let result = try await http.write(
            "v1/chores/complete", token: token, household: member.householdId,
            body: command, as: ChoreCompletionEnvelope.self
        )
        return try result.validated(household: member.householdId, command: command)
    }
}
