import Foundation

@testable import Nest

actor MealReminderTestServer {
    let member: VerifiedMember
    var meal: PlannedMeal
    var itemRevision = String(repeating: "a", count: 64)
    var reminder: MealReminder?
    var receipts: [UUID: MealReminderReceipt] = [:]
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
        meal = .init(
            entryId: UUID(), date: try CivilDate("2028-03-01"), slot: .dinner, title: "Fictional meal",
            recipeUrl: nil, notes: nil, definitionId: nil, leftoverSourceId: nil)
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
    func changeMeal() { itemRevision = String(repeating: "b", count: 64) }
    func changeReminder() {
        reminder = .init(
            entryId: meal.id, revision: UUID(), reviewedItemRevision: itemRevision,
            updatedBy: member.userId,
            settings: .init(enabled: false, recipientIds: [], localTime: "07:00", daysBefore: 0))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/meal-reminders/detail":
            data = try JSONEncoder().encode(
                MealReminderContext(
                    version: 1, householdId: member.householdId,
                    itemRevision: itemRevision, meal: meal, reminder: reminder))
        case "/v1/meal-reminders/operation", "/v1/meal-reminders/cancel-operation":
            let id = try operation(request)
            if request.url!.path.hasSuffix("cancel-operation"), receipts[id] == nil { cancelled.insert(id) }
            data = try JSONEncoder().encode(
                MealReminderRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: id,
                    status: receipts[id] != nil ? .recorded : cancelled.contains(id) ? .cancelled : .unresolved,
                    receipt: receipts[id]))
        case "/v1/meal-reminders/save": data = try await save(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(SaveMealReminder.self, from: request.httpBody!)
        guard receipts[command.operationId] == nil, !cancelled.contains(command.operationId) else {
            throw NestAPIFailure.contract
        }
        let settings = MealReminder(
            entryId: command.entryId, revision: UUID(),
            reviewedItemRevision: command.expectedItemRevision,
            updatedBy: member.userId, settings: command.settings)
        let receipt = MealReminderReceipt(
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
