import Foundation

struct PrivateMemory: Codable, Equatable, Identifiable, Sendable {
    let id: UUID
    let revision: String
    let content: String

    func validated() throws -> Self {
        guard MealRevision.valid(revision), revision != "0", MemoryText.valid(content)
        else { throw NestAPIFailure.contract }
        return self
    }
}

enum MemoryText {
    static func valid(_ value: String) -> Bool {
        let whitespace = CharacterSet(
            charactersIn:
                "\u{0009}\u{000A}\u{000B}\u{000C}\u{000D}\u{0020}\u{00A0}\u{1680}\u{2000}\u{2001}\u{2002}\u{2003}\u{2004}\u{2005}\u{2006}\u{2007}\u{2008}\u{2009}\u{200A}\u{2028}\u{2029}\u{202F}\u{205F}\u{3000}\u{FEFF}"
        )
        return value.utf16.count <= 1_000 && !value.contains("\0")
            && !value.trimmingCharacters(in: whitespace).isEmpty
    }
}

struct PrivateMemories: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let memories: [PrivateMemory]

    func validated(member: VerifiedMember) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            memories.count <= 64, Set(memories.map(\.id)).count == memories.count
        else { throw NestAPIFailure.contract }
        for memory in memories { _ = try memory.validated() }
        return self
    }
}

struct MemoryChange: Codable, Equatable, Sendable {
    let memoryId: UUID
    let expectedRevision: String
    let content: String

    func validated() throws -> Self {
        guard MealRevision.valid(expectedRevision), MemoryText.valid(content) else { throw NestAPIFailure.contract }
        return self
    }
}

struct MemoryApproval: Codable, Equatable, Sendable {
    enum Status: String, Codable, Sendable { case pending, approved, denied, consumed }
    let id: UUID
    let operationId: UUID
    let change: MemoryChange
    let status: Status
    let expiresAt: String
}

struct MemoryApprovalEnvelope: Codable, Sendable {
    let version: Int
    let actorId: UUID
    let householdId: UUID
    let approval: MemoryApproval

    func validated(member: VerifiedMember, id: UUID) throws -> Self {
        guard version == 1, actorId == member.userId, householdId == member.householdId,
            approval.id == id, AssistantTimestamp.date(approval.expiresAt) != nil
        else { throw NestAPIFailure.contract }
        _ = try approval.change.validated()
        return self
    }
}

extension AssistantAPI {
    func memories(token: String, member: VerifiedMember) async throws -> PrivateMemories {
        let result = try await http.read(
            "v1/memories", token: token, household: member.householdId, as: PrivateMemories.self)
        return try result.validated(member: member)
    }

    func memoryApproval(token: String, member: VerifiedMember, id: UUID) async throws -> MemoryApprovalEnvelope {
        let result = try await http.read(
            "v1/memories/approval?id=\(id.uuidString.lowercased())", token: token,
            household: member.householdId, as: MemoryApprovalEnvelope.self)
        return try result.validated(member: member, id: id)
    }
}
