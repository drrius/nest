import Foundation

struct MoneyCategory: Codable, Identifiable, Sendable {
    let categoryId: UUID
    let name: String
    let archived: Bool
    var id: UUID { categoryId }
}

struct MoneyCategories: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let after: UUID?
    let next: UUID?
    let categories: [MoneyCategory]

    func validated(member: VerifiedMember, cursor: UUID?) throws -> Self {
        guard version == 1, householdId == member.householdId, after == cursor, categories.count <= 50,
            next == nil || (categories.count == 50 && next == categories.last?.id)
        else { throw NestAPIFailure.contract }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for category in categories {
            let identity = category.id.uuidString.lowercased()
            guard !category.archived, !category.name.isEmpty, identity > previous else { throw NestAPIFailure.contract }
            previous = identity
        }
        return self
    }
}

extension MoneyAPI {
    func categories(token: String, member: VerifiedMember, after: UUID?) async throws -> MoneyCategories {
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/money/categories\(query)", token: token,
            household: member.householdId, as: MoneyCategories.self)
        return try result.validated(member: member, cursor: after)
    }
}

struct MoneyCategoryEnvelope: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let categoryId: UUID
    let category: MoneyCategory?

    func validated(member: VerifiedMember, categoryId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, self.categoryId == categoryId,
            category.map({ $0.id == categoryId && !$0.name.isEmpty }) != false
        else { throw NestAPIFailure.contract }
        return self
    }
}

extension MoneyAPI {
    func category(token: String, member: VerifiedMember, categoryId: UUID) async throws -> MoneyCategoryEnvelope {
        let result = try await http.read(
            "v1/money/category?categoryId=\(categoryId.uuidString.lowercased())", token: token,
            household: member.householdId, as: MoneyCategoryEnvelope.self)
        return try result.validated(member: member, categoryId: categoryId)
    }
}
