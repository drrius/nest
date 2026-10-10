import Foundation

@testable import Nest

actor RecurringReminderTestServer {
    let member: VerifiedMember
    var rule: RecurringRule
    var reminder: RecurringReminder?
    var receipts: [UUID: RecurringReminderReceipt] = [:]
    var cancelled: Set<UUID> = []
    var writes = 0
    var loseReply = true
    var failBeforeWrite = false
    var pauseWrite = false
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember) throws {
        self.member = member
        let future = try CivilDate("2028-03-01")
        rule = .init(
            ruleId: UUID(), revision: UUID(),
            configuration: .init(
                description: "Fictional bill", payerId: member.userId, categoryId: nil, note: nil,
                startDate: future, schedule: .init(kind: .monthly, weekday: nil, dayOfMonth: 1),
                mode: .variable, amountCentimes: nil, allocations: nil), status: .active,
            authorizedBy: member.userId, authorizedAt: "2028-01-01T08:00:00.000000Z",
            coveredThrough: nil, nextDueOn: future)
        try rule.validated(member: member)
    }

    func failBeforeTransmission() { failBeforeWrite = true }
    func pauseNext() {
        pauseWrite = true
        loseReply = false
    }
    func release() {
        response?.resume()
        response = nil
    }
    func waitForWrite() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }
    func changeRule(revision: UUID? = nil, status: RecurringRule.Status = .active, due: CivilDate?) {
        rule = .init(
            ruleId: rule.id, revision: revision ?? rule.revision, configuration: rule.configuration,
            status: status, authorizedBy: rule.authorizedBy, authorizedAt: rule.authorizedAt,
            coveredThrough: rule.coveredThrough, nextDueOn: due)
    }
    func changeReminder() {
        reminder = .init(
            ruleId: rule.id, revision: UUID(), reviewedRuleRevision: rule.revision, reviewedDueOn: rule.nextDueOn!,
            updatedBy: member.userId,
            settings: .init(enabled: false, recipientIds: [], localTime: "07:00", daysBefore: 0))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/recurring-reminders/detail":
            data = try JSONEncoder().encode(
                RecurringReminderContext(
                    version: 1, householdId: member.householdId,
                    rule: rule, reminder: reminder))
        case "/v1/recurring-reminders/operation", "/v1/recurring-reminders/cancel-operation":
            let id = try operation(request)
            if request.url!.path.hasSuffix("cancel-operation"), receipts[id] == nil { cancelled.insert(id) }
            data = try JSONEncoder().encode(
                RecurringReminderRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: id,
                    status: receipts[id] != nil ? .recorded : cancelled.contains(id) ? .cancelled : .unresolved,
                    receipt: receipts[id]))
        case "/v1/recurring-reminders/save": data = try await save(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(SaveRecurringReminder.self, from: request.httpBody!)
        guard receipts[command.operationId] == nil, !cancelled.contains(command.operationId) else {
            throw NestAPIFailure.contract
        }
        let settings = RecurringReminder(
            ruleId: command.ruleId, revision: UUID(),
            reviewedRuleRevision: command.expectedRuleRevision,
            reviewedDueOn: command.expectedDueOn,
            updatedBy: member.userId, settings: command.settings)
        let receipt = RecurringReminderReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command, reminder: settings)
        writes += 1
        reminder = settings
        receipts[command.operationId] = receipt
        if pauseWrite {
            await withCheckedContinuation { continuation in
                response = continuation
                arrived = true
                waiter?.resume()
                waiter = nil
            }
        }
        if loseReply {
            loseReply = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(receipt)
    }

    private func operation(_ request: URLRequest) throws -> UUID {
        if let body = request.httpBody {
            struct Operation: Decodable { let operationId: UUID }
            return try JSONDecoder().decode(Operation.self, from: body).operationId
        }
        let parts = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        guard let id = parts.queryItems?.first(where: { $0.name == "operationId" })?.value,
            let uuid = UUID(uuidString: id)
        else { throw NestAPIFailure.contract }
        return uuid
    }
}
