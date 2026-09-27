import Foundation

public struct GroceryAPI: Sendable {
    private let http: NestHTTP

    public init(http: NestHTTP) { self.http = http }

    public func verify(token: String, expectedActor: UUID) async throws -> VerifiedMember {
        let response = try await http.read("v1/session", token: token, as: VerifiedSession.self)
        return try response.validated(actor: expectedActor)
    }

    public func list(token: String, member: VerifiedMember) async throws -> GroceryList {
        let response = try await http.read(
            "v1/groceries", token: token, household: member.householdId, as: GroceryList.self
        )
        return try response.validated(household: member.householdId)
    }

    public func categories(token: String, member: VerifiedMember) async throws -> GroceryCategories {
        let response = try await http.read(
            "v1/groceries/categories", token: token, household: member.householdId,
            as: GroceryCategories.self
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

    public func add(
        token: String, member: VerifiedMember, command: AddGrocery
    ) async throws -> GroceryWriteReceipt {
        let response = try await http.write(
            "v1/groceries/add", token: token, household: member.householdId,
            body: command, as: GroceryAddEnvelope.self
        )
        return try response.validated(household: member.householdId, command: command)
    }

    public func edit(
        token: String, member: VerifiedMember, item: GroceryItem, command: EditGrocery
    ) async throws -> GroceryWriteReceipt {
        let response = try await http.write(
            "v1/groceries/edit", token: token, household: member.householdId,
            body: command, as: GroceryEditEnvelope.self
        )
        return try response.validated(household: member.householdId, item: item, command: command)
    }
}
