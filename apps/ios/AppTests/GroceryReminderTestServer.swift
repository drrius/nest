import Foundation

@testable import Nest

actor GroceryReminderTestServer {
    let member: VerifiedMember
    var grocery: GroceryItem
    var itemVersion = "1"
    var reminder: GroceryReminder?
    var receipts: [UUID: GroceryReminderReceipt] = [:]
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
        grocery = GroceryItem(
            itemId: UUID(), name: "Fictional grocery", quantity: nil, unit: nil,
            categoryId: nil, categoryName: nil, version: "1", checked: false,
            legacyClaimed: false, offlineEpoch: nil, mealSource: nil)
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
    func changeGrocery() {
        itemVersion = "2"
        grocery = .init(
            itemId: grocery.id, name: grocery.name, quantity: nil, unit: nil,
            categoryId: nil, categoryName: nil, version: itemVersion, checked: false,
            legacyClaimed: false, offlineEpoch: nil, mealSource: nil)
    }
    func checkGrocery() {
        itemVersion = "2"
        grocery = .init(
            itemId: grocery.id, name: grocery.name, quantity: nil, unit: nil,
            categoryId: nil, categoryName: nil, version: itemVersion, checked: true,
            legacyClaimed: false, offlineEpoch: nil, mealSource: nil)
    }
    func changeReminder() throws {
        reminder = .init(
            itemId: grocery.id, revision: UUID(), reviewedItemVersion: itemVersion,
            updatedBy: member.userId,
            settings: .init(
                enabled: false, recipientIds: [], localDate: try CivilDate("2027-01-01"), localTime: "07:00"))
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let data: Data
        switch request.url!.path {
        case "/v1/grocery-reminders/detail":
            data = try JSONEncoder().encode(
                GroceryReminderContext(
                    version: 1, householdId: member.householdId,
                    itemVersion: itemVersion, grocery: grocery, reminder: reminder))
        case "/v1/grocery-reminders/operation", "/v1/grocery-reminders/cancel-operation":
            let id = try operation(request)
            if request.url!.path.hasSuffix("cancel-operation"), receipts[id] == nil { cancelled.insert(id) }
            data = try JSONEncoder().encode(
                GroceryReminderRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: id,
                    status: receipts[id] != nil ? .recorded : cancelled.contains(id) ? .cancelled : .unresolved,
                    receipt: receipts[id]))
        case "/v1/grocery-reminders/save": data = try await save(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(SaveGroceryReminder.self, from: request.httpBody!)
        guard receipts[command.operationId] == nil, !cancelled.contains(command.operationId) else {
            throw NestAPIFailure.contract
        }
        let settings = GroceryReminder(
            itemId: command.itemId, revision: UUID(),
            reviewedItemVersion: command.expectedItemVersion,
            updatedBy: member.userId, settings: command.settings)
        let receipt = GroceryReminderReceipt(
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
