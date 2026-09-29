import Foundation

@testable import Nest

actor RenewalReminderTestServer {
    let member: VerifiedMember
    var renewal: CalendarRenewal
    var reminder: RenewalReminder?
    var receipts: [UUID: RenewalReminderReceipt] = [:]
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
        let fields = CalendarRenewal.Fields(
            title: "Fictional renewal", renewalOn: try CivilDate("2028-03-01"),
            noticeDays: 1, responsibleId: nil, recurringRuleId: nil)
        renewal = .init(
            renewalId: UUID(), revision: UUID(), fields: fields,
            cancellationOn: fields.cancellationDeadline!, removed: false)
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
    func changeRenewal() {
        renewal = .init(
            renewalId: renewal.id, revision: UUID(), fields: renewal.fields,
            cancellationOn: renewal.cancellationOn, removed: false)
    }
    func changeReminder() {
        reminder = .init(
            renewalId: renewal.id, revision: UUID(), reviewedRenewalRevision: renewal.revision,
            updatedBy: member.userId,
            settings: .init(
                anchor: .renewal,
                delivery: .init(enabled: false, recipientIds: [], localTime: "07:00", daysBefore: 0)))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/renewals/detail":
            struct Detail: Encodable {
                let version = 1
                let householdId: UUID
                let renewal: CalendarRenewal
            }
            data = try JSONEncoder().encode(Detail(householdId: member.householdId, renewal: renewal))
        case "/v1/renewal-reminders/detail":
            data = try JSONEncoder().encode(
                RenewalReminderEnvelope(
                    version: 1, householdId: member.householdId,
                    renewalId: renewal.id, reminder: reminder))
        case "/v1/renewal-reminders/operation", "/v1/renewal-reminders/cancel-operation":
            let id = try operation(request)
            if request.url!.path.hasSuffix("cancel-operation"), receipts[id] == nil { cancelled.insert(id) }
            data = try JSONEncoder().encode(
                RenewalReminderRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: id,
                    status: receipts[id] != nil ? .recorded : cancelled.contains(id) ? .cancelled : .unresolved,
                    receipt: receipts[id]))
        case "/v1/renewal-reminders/save": data = try await save(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(SaveRenewalReminder.self, from: request.httpBody!)
        guard receipts[command.operationId] == nil, !cancelled.contains(command.operationId) else {
            throw NestAPIFailure.contract
        }
        let settings = RenewalReminder(
            renewalId: command.renewalId, revision: UUID(),
            reviewedRenewalRevision: command.expectedRenewalRevision,
            updatedBy: member.userId, settings: command.settings)
        let receipt = RenewalReminderReceipt(
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
