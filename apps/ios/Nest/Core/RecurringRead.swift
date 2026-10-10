import Foundation

struct RecurringRule: Codable, Equatable, Identifiable, Sendable {
    enum Status: String, Codable { case active, paused, cancelled }
    let ruleId: UUID
    let revision: UUID
    let configuration: RecurringConfiguration
    let status: Status
    let authorizedBy: UUID
    let authorizedAt: String
    let coveredThrough: CivilDate?
    let nextDueOn: CivilDate?
    var id: UUID { ruleId }

    func validated(member: VerifiedMember) throws {
        try configuration.validated(member: member)
        guard MoneyTime.timestamp(authorizedAt) else { throw NestAPIFailure.contract }
    }

    func isDue(on today: CivilDate) -> Bool {
        guard status == .active, configuration.mode == .variable, let nextDueOn else { return false }
        return nextDueOn.value <= today.value && nextDueOn.value >= configuration.startDate.value
            && (coveredThrough == nil || coveredThrough!.value < nextDueOn.value)
    }
}

struct RecurringList: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let today: CivilDate
    let after: UUID?
    let next: UUID?
    let rules: [RecurringRule]

    func validated(member: VerifiedMember, cursor: UUID?, dueOnly: Bool = false) throws -> Self {
        guard version == 1, householdId == member.householdId, after == cursor, rules.count <= 50,
            next == nil || (rules.count == 50 && next == rules.last?.id)
        else { throw NestAPIFailure.contract }
        var previous = cursor?.uuidString.lowercased() ?? ""
        for rule in rules {
            let current = rule.id.uuidString.lowercased()
            guard current > previous, !dueOnly || rule.isDue(on: today) else { throw NestAPIFailure.contract }
            try rule.validated(member: member)
            previous = current
        }
        return self
    }
}

struct RecurringDetail: Codable, Sendable {
    let version: Int
    let householdId: UUID
    let today: CivilDate
    let rule: RecurringRule

    func validated(member: VerifiedMember, ruleId: UUID) throws -> Self {
        guard version == 1, householdId == member.householdId, rule.id == ruleId else { throw NestAPIFailure.contract }
        try rule.validated(member: member)
        return self
    }
}

extension MoneyAPI {
    func recurringRules(token: String, member: VerifiedMember, after: UUID?, dueOnly: Bool = false) async throws
        -> RecurringList
    {
        let route = dueOnly ? "due-variable" : "rules"
        let query = after.map { "?after=\($0.uuidString.lowercased())" } ?? ""
        let result = try await http.read(
            "v1/money/recurring/\(route)\(query)", token: token, household: member.householdId,
            as: RecurringList.self)
        return try result.validated(member: member, cursor: after, dueOnly: dueOnly)
    }

    func recurringRule(token: String, member: VerifiedMember, ruleId: UUID) async throws -> RecurringDetail {
        let result = try await http.read(
            "v1/money/recurring/rule?ruleId=\(ruleId.uuidString.lowercased())",
            token: token, household: member.householdId, as: RecurringDetail.self)
        return try result.validated(member: member, ruleId: ruleId)
    }
}
