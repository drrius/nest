import Foundation

public struct MealAPI: Sendable {
    private let http: NestHTTP

    public init(http: NestHTTP) { self.http = http }

    public func verify(token: String, expectedActor: UUID) async throws -> VerifiedMember {
        let response = try await http.read("v1/session", token: token, as: VerifiedSession.self)
        return try response.validated(actor: expectedActor)
    }

    public func week(
        token: String, member: VerifiedMember, start: MealWeekStart
    ) async throws -> MealWeekSnapshot {
        let path = "v1/meals/week?weekStart=\(start.date.value)"
        let result = try await http.read(
            path, token: token, household: member.householdId, as: MealWeekSnapshot.self)
        return try result.validated(household: member.householdId, week: start)
    }

    public func visibleSlots(token: String, member: VerifiedMember) async throws -> [MealSlot] {
        let result = try await http.read(
            "v1/cooking-preferences", token: token, household: member.householdId,
            as: CookingSlotsEnvelope.self)
        return try result.validated(household: member.householdId)
    }

    public func place(
        token: String, member: VerifiedMember, week: MealWeekSnapshot, command: PlaceMeal
    ) async throws -> MealPlacementReceipt {
        _ = try command.validated(against: week)
        let result = try await http.write(
            "v1/meals/place", token: token, household: member.householdId,
            body: command, as: MealPlacementEnvelope.self)
        return try result.validated(member: member, command: command)
    }
}
