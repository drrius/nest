import Foundation

public struct GroceryAPI: Sendable {
    private let http: NestHTTP

    public init(http: NestHTTP) { self.http = http }

    public func list(token: String, member: VerifiedMember) async throws -> GroceryList {
        let response = try await http.read(
            "v1/groceries", token: token, household: member.householdId, as: GroceryList.self
        )
        return try response.validated(household: member.householdId)
    }

    public func check(
        token: String, member: VerifiedMember, command: CheckGrocery
    ) async throws -> GroceryCheckReceipt {
        let response = try await http.write(
            "v1/groceries/check", token: token, household: member.householdId,
            body: command, as: GroceryCheckEnvelope.self
        )
        return try response.validated(household: member.householdId, command: command)
    }
}
