import Foundation

struct MemberColourChoice: Codable, Equatable, Sendable {
    let actorId: UUID
    let colour: MemberColor
    let revision: String
}

struct MemberColoursEnvelope: Codable, Equatable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let colours: [MemberColourChoice]

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId, colours.count <= 2,
            Set(colours.map(\.actorId)).count == colours.count, Set(colours.map(\.colour)).count == colours.count,
            colours.allSatisfy({ MealRevision.valid($0.revision) && $0.revision != "0" })
        else { throw NestAPIFailure.contract }
        return self
    }

    /// Each member's saved choice; anyone missing keeps the shared default.
    var choices: [UUID: MemberColor] {
        Dictionary(uniqueKeysWithValues: colours.map { ($0.actorId, $0.colour) })
    }

    func revision(of actor: UUID) -> String {
        colours.first { $0.actorId == actor }?.revision ?? "0"
    }
}

struct SaveMemberColour: Codable, Equatable, Sendable {
    let operationId: UUID
    let expectedRevision: String
    let colour: MemberColor

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), let revision = Int64(expectedRevision), revision < Int64.max else {
            throw NestAPIFailure.invalid
        }
        return self
    }
}

struct MemberColourReceipt: Codable, Equatable, Sendable {
    let actorId: UUID
    let householdId: UUID
    let operationId: UUID
    let revision: String
    let colour: MemberColor

    func validated(member: VerifiedMember, command: SaveMemberColour) throws -> Self {
        _ = try command.validated()
        guard actorId == member.userId, householdId == member.householdId, operationId == command.operationId,
            colour == command.colour, let previous = Int64(command.expectedRevision), revision == String(previous + 1)
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension SetupAPI {
    func memberColours(token: String, member: VerifiedMember) async throws -> MemberColoursEnvelope {
        let result = try await http.read(
            "v1/member-colours", token: token, household: member.householdId, responseLimit: 4096,
            as: MemberColoursEnvelope.self)
        return try result.validated(member: member)
    }

    func saveMemberColour(token: String, member: VerifiedMember, command: SaveMemberColour) async throws
        -> MemberColourReceipt
    {
        _ = try command.validated()
        let result = try await http.write(
            "v1/member-colours/save", token: token, household: member.householdId, body: command,
            as: MemberColourSaveEnvelope.self)
        guard result.version == 1 else { throw NestAPIFailure.contract }
        return try result.receipt.validated(member: member, command: command)
    }
}

private struct MemberColourSaveEnvelope: Decodable {
    let version: Int
    let receipt: MemberColourReceipt
}
