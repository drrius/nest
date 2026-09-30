import Foundation
import XCTest

@testable import Nest

actor CalendarPrivacyTestServer {
    let member: VerifiedMember
    let incarnation = UUID()
    var revision: Int64 = 4
    var enabled = true
    var reads = 0
    var writes: [SetCalendarConsent] = []
    private var offlineRead = false
    private var loseReply = false
    private var conflictWrite = false
    private var pauseWrite = false
    private var arrived = false
    private var waiting: CheckedContinuation<Void, Never>?
    private var response: CheckedContinuation<Void, Never>?
    private var last: SetCalendarConsent?
    private var raceEnable: SetCalendarConsent?
    private var recordEnable: (@Sendable (CalendarConsentReceipt) async throws -> Void)?

    init(member: VerifiedMember) { self.member = member }
    func setOfflineRead(_ value: Bool) { offlineRead = value }
    func setEnabled(_ value: Bool) { enabled = value }
    func loseNextReply() { loseReply = true }
    func conflictNextWrite() { conflictWrite = true }
    func pauseNextWrite() { pauseWrite = true }

    func settleEnableDuringRead(
        _ command: SetCalendarConsent, record: @escaping @Sendable (CalendarConsentReceipt) async throws -> Void
    ) {
        raceEnable = command
        recordEnable = record
    }

    func waitForWrite() async {
        if arrived { return }
        await withCheckedContinuation { waiting = $0 }
    }

    func release() {
        response?.resume()
        response = nil
    }

    func current() -> CalendarConsent {
        .init(incarnation: incarnation, version: String(revision), enabled: enabled)
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        if request.url?.path == "/v1/calendar/consent" {
            return try await read(request)
        }
        XCTAssertEqual(request.url?.path, "/v1/calendar/consent/set")
        let command = try JSONDecoder().decode(SetCalendarConsent.self, from: request.httpBody!)
        writes.append(command)
        if pauseWrite {
            pauseWrite = false
            await withCheckedContinuation { continuation in
                response = continuation
                arrived = true
                waiting?.resume()
                waiting = nil
            }
        }
        return try apply(command, request: request)
    }

    private func read(_ request: URLRequest) async throws -> (Data, URLResponse) {
        reads += 1
        if offlineRead { throw URLError(.notConnectedToInternet) }
        let captured = try encoded(
            CalendarConsentEnvelope(
                version: 1, actorId: member.userId, householdId: member.householdId, consent: current()),
            request: request)
        if let command = raceEnable, let record = recordEnable {
            raceEnable = nil
            recordEnable = nil
            writes.append(command)
            let result = try apply(command, request: request)
            try await record(JSONDecoder().decode(CalendarConsentReceipt.self, from: result.0))
        }
        return captured
    }

    private func apply(_ command: SetCalendarConsent, request: URLRequest) throws -> (Data, URLResponse) {
        if conflictWrite {
            conflictWrite = false
            revision = 8
        }
        if command != last {
            guard command.incarnation == incarnation, command.expectedRevision == String(revision) else {
                return (
                    Data(), HTTPURLResponse(url: request.url!, statusCode: 412, httpVersion: nil, headerFields: nil)!
                )
            }
            revision += 1
            enabled = command.enabled
            last = command
        }
        if loseReply {
            loseReply = false
            throw URLError(.networkConnectionLost)
        }
        return try encoded(
            CalendarConsentReceipt(
                version: 1, actorId: member.userId, householdId: member.householdId,
                operationId: command.operationId, consent: current()), request: request)
    }

    private func encoded<Value: Encodable>(_ value: Value, request: URLRequest) throws -> (Data, URLResponse) {
        (
            try JSONEncoder().encode(value),
            HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
        )
    }
}

@MainActor
struct CalendarPrivacyModelFixture {
    let member: VerifiedMember
    let auth: FakeAuthentication
    let chores: ChoreAPI
    let server: CalendarPrivacyTestServer
    let calendar: CalendarAPI
    let url: URL
    let store: ChoreOfflineStore
    let model: SessionModel

    static func make() async throws -> Self {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Test")
        let other = UUID()
        let auth = FakeAuthentication(
            active: .init(userId: member.userId, accessToken: "token-A"),
            nextSignIn: .init(userId: other, accessToken: "token-B"))
        let choreServer = FakeChoreServer(actorA: member.userId, actorB: other, household: member.householdId)
        let choreHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) {
            try await choreServer.respond($0)
        }
        let server = CalendarPrivacyTestServer(member: member)
        let calendarHTTP = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { try await server.respond($0) }
        let url = FileManager.default.temporaryDirectory.appending(path: "calendar-privacy-model-\(UUID()).sqlite")
        let store = try ChoreOfflineStore(url: url)
        let chores = ChoreAPI(http: choreHTTP)
        let calendar = CalendarAPI(http: calendarHTTP)
        let model = SessionModel(auth: auth, chores: chores, offline: store, calendarAPI: calendar)
        await model.restore()
        return Self(
            member: member, auth: auth, chores: chores, server: server, calendar: calendar,
            url: url, store: store, model: model)
    }

    func reopened() async throws -> SessionModel {
        let next = SessionModel(
            auth: auth, chores: chores, offline: try ChoreOfflineStore(url: url), calendarAPI: calendar)
        await next.restore()
        return next
    }
}
