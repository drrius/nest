import Foundation

@testable import Nest

struct RecurringEntryPreflightFixture {
    let member: VerifiedMember
    let partner: UUID
    let ruleId: UUID
    let revision: UUID
    let configuration: RecurringConfiguration
    let status: RecurringRule.Status
    let fault: String?

    func respond(_ request: URLRequest) throws -> (Data, URLResponse)? {
        let path = request.url!.path
        guard path.hasSuffix("/balance") || path.hasSuffix("/rules") || path.hasSuffix("/rule") else { return nil }
        if fault == "offline" { throw URLError(.notConnectedToInternet) }
        let household = fault == "household" ? UUID() : member.householdId
        let today = try CivilDate(fault == "day" ? "2026-10-01" : "2026-09-28")
        let data: Data
        if path.hasSuffix("/balance") {
            let value = MoneyBalance(
                version: 1, householdId: household, eventCount: "0", openingEstablished: false,
                members: [
                    .init(actorId: member.userId, displayName: "Alex", centimes: try Centimes("0")),
                    .init(
                        actorId: fault == "member" ? UUID() : partner, displayName: "Sam", centimes: try Centimes("0")),
                ])
            data = try JSONEncoder().encode(value)
        } else if path.hasSuffix("/rules") {
            let value = RecurringList(
                version: 1, householdId: household, today: today, after: nil, next: nil, rules: [])
            data = try JSONEncoder().encode(value)
        } else {
            let rule = RecurringRule(
                ruleId: ruleId, revision: fault == "revision" ? UUID() : revision, configuration: configuration,
                status: currentStatus,
                authorizedBy: member.userId, authorizedAt: "2026-09-28T00:00:00.000000Z",
                coveredThrough: try fault == "covered" ? CivilDate("2026-10-27") : nil,
                nextDueOn: try CivilDate(fault == "covered" ? "2026-10-28" : "2026-09-28"))
            let value = RecurringDetail(version: 1, householdId: household, today: today, rule: rule)
            data = try JSONEncoder().encode(value)
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    static func configuration(member: VerifiedMember) throws -> RecurringConfiguration {
        .init(
            description: "Bill", payerId: member.userId, categoryId: nil, note: nil,
            startDate: try CivilDate("2026-09-01"),
            schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 28),
            mode: .variable, amountCentimes: nil, allocations: nil)
    }

    private var currentStatus: RecurringRule.Status {
        if fault == "cancelled" { return .cancelled }
        if fault == "state" { return status == .paused ? .active : .paused }
        return status
    }
}
