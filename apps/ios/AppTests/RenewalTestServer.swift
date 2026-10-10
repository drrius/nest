import Foundation

@testable import Nest

actor RenewalTestServer {
    let member: VerifiedMember
    var renewal: CalendarRenewal?
    var receipts: [UUID: RenewalReceipt] = [:]
    var cancellations: Set<UUID> = []
    var writes = 0
    var loseNextResponse = true
    var failBeforeWrite = false
    var pauseWrite = false
    private var arrived = false
    private var waiter: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember) { self.member = member }
    func failBeforeTransmission() { failBeforeWrite = true }
    func loseNext() { loseNextResponse = true }
    func pauseNext() {
        pauseWrite = true
        loseNextResponse = false
    }
    func release() {
        response?.resume()
        response = nil
    }
    func waitForWrite() async {
        if arrived { return }
        await withCheckedContinuation { waiter = $0 }
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url!.path
        let data: Data
        switch path {
        case "/v1/renewals":
            struct Page: Encodable {
                let version = 1
                let householdId: UUID
                let after: UUID? = nil
                let next: UUID? = nil
                let renewals: [CalendarRenewal]
            }
            data = try JSONEncoder().encode(
                Page(
                    householdId: member.householdId,
                    renewals: renewal.map { $0.removed ? [] : [$0] } ?? []))
        case "/v1/renewals/detail":
            struct Detail: Encodable {
                let version = 1
                let householdId: UUID
                let renewal: CalendarRenewal
            }
            guard let renewal else { throw NestAPIFailure.invalid }
            data = try JSONEncoder().encode(Detail(householdId: member.householdId, renewal: renewal))
        case "/v1/renewals/operation", "/v1/renewals/cancel-operation":
            let operation = try operationId(request)
            if path.hasSuffix("cancel-operation"), receipts[operation] == nil { cancellations.insert(operation) }
            let receipt = receipts[operation]
            let result = RenewalRecovery(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: operation,
                status: receipt != nil ? .recorded : cancellations.contains(operation) ? .cancelled : .unresolved,
                receipt: receipt)
            data = try JSONEncoder().encode(result)
        case "/v1/renewals/save", "/v1/renewals/remove":
            data = try await change(request)
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func change(_ request: URLRequest) async throws -> Data {
        if failBeforeWrite { throw URLError(.notConnectedToInternet) }
        let command = try JSONDecoder().decode(RenewalCommand.self, from: request.httpBody!)
        guard !cancellations.contains(command.operationId) else { throw NestAPIFailure.conflict }
        guard receipts[command.operationId] == nil else { throw NestAPIFailure.contract }
        let fields = command.fields ?? renewal!.fields
        let record = CalendarRenewal(
            renewalId: command.renewalId, revision: UUID(), fields: fields,
            cancellationOn: fields.cancellationDeadline!, removed: command.removing)
        let receipt = RenewalReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, command: command,
            action: command.removing ? .removed : .saved, renewal: record)
        writes += 1
        renewal = record
        receipts[command.operationId] = receipt
        if pauseWrite {
            await withCheckedContinuation { continuation in
                response = continuation
                arrived = true
                waiter?.resume()
                waiter = nil
            }
        }
        if loseNextResponse {
            loseNextResponse = false
            throw URLError(.networkConnectionLost)
        }
        return try JSONEncoder().encode(receipt)
    }

    private func operationId(_ request: URLRequest) throws -> UUID {
        if let body = request.httpBody {
            struct Operation: Decodable { let operationId: UUID }
            return try JSONDecoder().decode(Operation.self, from: body).operationId
        }
        let parts = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!
        guard let value = parts.queryItems?.first(where: { $0.name == "operationId" })?.value,
            let id = UUID(uuidString: value)
        else { throw NestAPIFailure.contract }
        return id
    }
}
