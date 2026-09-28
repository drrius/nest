import Foundation

public struct FoodAPI: Sendable {
    private let http: NestHTTP
    public init(http: NestHTTP) { self.http = http }

    public func read(token: String, member: VerifiedMember) async throws -> FoodProfileEnvelope {
        let result = try await http.read(
            "v1/food-preferences", token: token,
            household: member.householdId, as: FoodProfileEnvelope.self)
        return try result.validated(member: member)
    }

    public func save(token: String, member: VerifiedMember, command: SaveFoodPreferences) async throws
        -> FoodPreferenceReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/food-preferences/save", token: token,
            household: member.householdId, body: command, as: FoodSaveEnvelope.self)
        guard result.version == 1 else { throw FoodPreferenceError.invalidResponse }
        return try result.receipt.validated(member: member, command: command)
    }
}

private struct FoodSaveEnvelope: Decodable {
    let version: Int
    let receipt: FoodPreferenceReceipt
}
