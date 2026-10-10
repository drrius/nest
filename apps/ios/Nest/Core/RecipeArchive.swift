import Foundation

public struct ArchiveRecipe: Codable, Equatable, Sendable {
    public let operationId: UUID
    public let definitionId: UUID
    public let expectedRevision: String

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max
        else { throw MealContractError.invalidPlacement }
        return self
    }
}

public struct RecipeArchiveReceipt: Codable, Equatable, Sendable {
    public let version: Int
    public let actorId: UUID
    public let householdId: UUID
    public let operationId: UUID
    public let definitionId: UUID
    public let revision: String

    func validated(member: VerifiedMember, command: ArchiveRecipe) throws -> Self {
        _ = try command.validated()
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            operationId == command.operationId, definitionId == command.definitionId,
            let previous = Int64(command.expectedRevision), revision == String(previous + 1)
        else { throw MealContractError.invalidReceipt }
        return self
    }
}

struct RecipeArchiveEnvelope: Decodable {
    let version: Int
    let receipt: RecipeArchiveReceipt
}
