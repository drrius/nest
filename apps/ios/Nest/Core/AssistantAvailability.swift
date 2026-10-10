import Foundation

enum AssistantAvailabilityFailure: Error { case disabled }

struct AssistantAvailability: Decodable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let available: Bool

    func requireAvailable(member: VerifiedMember) throws {
        guard version == 1, actorId == member.userId, householdId == member.householdId else {
            throw NestAPIFailure.contract
        }
        guard available else { throw AssistantAvailabilityFailure.disabled }
    }
}

extension AssistantAPI {
    func requireAvailable(token: String, member: VerifiedMember) async throws {
        let value = try await http.read(
            "v1/assistant/availability", token: token, household: member.householdId,
            as: AssistantAvailability.self)
        try value.requireAvailable(member: member)
    }
}
