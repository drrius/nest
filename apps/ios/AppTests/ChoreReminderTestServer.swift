import Foundation

@testable import Nest

actor ChoreReminderTestServer {
    let member: VerifiedMember
    var chore: NestChore
    var itemRevision = String(repeating: "a", count: 64)
    var reminder: ChoreReminder?
    var receipts: [UUID: ChoreReminderReceipt] = [:]
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
        chore = .init(
            occurrenceId: UUID(), title: "Fictional chore", dueDate: try CivilDate("2028-03-01"),
            assigneeId: nil, offlineEpoch: nil)
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
    func changeChore() { itemRevision = String(repeating: "b", count: 64) }
    func changeReminder() {
        reminder = .init(
            occurrenceId: chore.id, revision: UUID(), reviewedItemRevision: itemRevision,
            updatedBy: member.userId,
            settings: .init(enabled: false, recipientIds: [], localTime: "07:00", daysBefore: 0))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/chore-reminders/detail":
            data = try JSONEncoder().encode(
                ChoreReminderContext(
                    version: 1, householdId: member.householdId,
                    itemRevision: itemRevision, chore: chore, reminder: reminder))
        case "/v1/chore-reminders/operation", "/v1/chore-reminders/cancel-operation":
            let id = try operation(request)
            if request.url!.path.hasSuffix("cancel-operation"), receipts[id] == nil { cancelled.insert(id) }
            data = try JSONEncoder().encode(
                ChoreReminderRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: id,
                    status: receipts[id] != nil ? .recorded : cancelled.contains(id) ? .cancelled : .unresolved,
                    receipt: receipts[id]))
        case "/v1/chore-reminders/save": data = try await save(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(SaveChoreReminder.self, from: request.httpBody!)
        guard receipts[command.operationId] == nil, !cancelled.contains(command.operationId) else {
            throw NestAPIFailure.contract
        }
        let settings = ChoreReminder(
            occurrenceId: command.occurrenceId, revision: UUID(),
            reviewedItemRevision: command.expectedItemRevision,
            updatedBy: member.userId, settings: command.settings)
        let receipt = ChoreReminderReceipt(
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
