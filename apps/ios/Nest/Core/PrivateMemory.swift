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
        return value.utf16.count <= 1_000 && !value.contains("\0")
            && !value.trimmingCharacters(in: TextWhitespace.ecmaScript).isEmpty
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
