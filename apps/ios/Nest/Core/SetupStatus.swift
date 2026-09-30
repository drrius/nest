import Foundation

struct SetupStatus: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let foodConfigured: Bool
    let cookingConfigured: Bool
    let notificationsConfigured: Bool

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw NestAPIFailure.contract
        }
        return self
    }
}

struct SetupAPI: Sendable {
    let http: NestHTTP

    func read(token: String, member: VerifiedMember) async throws -> SetupStatus {
        let result = try await http.read(
            "v1/setup/status", token: token, household: member.householdId,
            responseLimit: 4096, as: SetupStatus.self)
        return try result.validated(member: member)
    }
}
