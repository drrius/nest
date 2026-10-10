import Foundation
import XCTest

@testable import Nest

/// Controlled native lifecycle boundary. These fixtures do not establish hosted JWT/RLS or APNs delivery evidence.
@MainActor
struct PushEnrollmentFixture {
    let member: VerifiedMember
    let sessionId: UUID
    let auth: FakeAuthentication
    let store: ChoreOfflineStore
    let server: PushEnrollmentServer
    let session: SessionModel
    let hardware: EnrollmentHardware

    static func make(_ test: XCTestCase, build: NativePushBuild = .available(.sandbox)) async throws -> Self {
        let member = VerifiedMember(userId: UUID(), householdId: UUID(), displayName: "Alex")
        let sessionId = UUID()
        let auth = FakeAuthentication(active: authenticated(member: member, session: sessionId))
        let url = FileManager.default.temporaryDirectory.appending(path: "push-enrollment-\(UUID()).sqlite")
        test.addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        let store = try ChoreOfflineStore(url: url)
        let storage = SecureAuthStorage(service: "push-enrollment-\(UUID())")
        test.addTeardownBlock { try? storage.remove(key: "installation/v1") }
        let installation = PushInstallationIdentity(storage: storage)
        let server = try PushEnrollmentServer(member: member, installation: installation.read())
        let http = try NestHTTP(baseURL: URL(string: "https://nest.example")!) { request in
            if request.url?.path == "/v1/push-devices/save" {
                let tracked = try await store.trackedPushSessions(actor: member.userId)
                guard tracked.contains(sessionId) else { throw NestAPIFailure.contract }
            }
            return try await server.respond(request)
        }
        let session = SessionModel(
            auth: auth, chores: ChoreAPI(http: http), offline: store,
            notificationAPI: NotificationAPI(http: http), pushBuild: build,
            pushInstallation: installation)
        session.lease = try await store.activate(member)
        session.status = .ready(member)
        return Self(
            member: member, sessionId: sessionId, auth: auth, store: store, server: server,
            session: session, hardware: EnrollmentHardware())
    }

    static func authenticated(member: VerifiedMember, session: UUID) -> AuthenticatedSession {
        let claims = Data("{\"sub\":\"\(member.userId)\",\"session_id\":\"\(session)\"}".utf8)
        let encoded = claims.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        return .init(userId: member.userId, accessToken: "e30.\(encoded).c2ln")
    }

    func switchPresentation(to member: VerifiedMember?) async throws {
        session.generation += 1
        if let member {
            session.lease = try await store.activate(member)
            session.status = .ready(member)
        } else {
            if let lease = session.lease { try await store.deactivate(lease) }
            session.lease = nil
            session.status = .signedOut
        }
    }
}

@MainActor
final class EnrollmentHardware: NativePushHardware {
    var supported = true
    var currentPermission = PushPermission.allowed
    var asks = 0
    var captures = 0
    var removals = 0
    var beforeCapture: (() async throws -> Void)?

    func permission() async -> PushPermission { currentPermission }
    func requestPermission() async throws -> PushPermission {
        asks += 1
        guard currentPermission.allowsDelivery else { throw NativePushFailure.permissionDenied }
        return currentPermission
    }
    func captureToken(request: UUID) async throws -> Data {
        captures += 1
        try await beforeCapture?()
        return Data([0, 1, 2, 3])
    }
    func cancelTokenRequest(request: UUID) {}
    func disableLocalDelivery() { removals += 1 }
}

actor PushEnrollmentServer {
    let member: VerifiedMember
    var state: PushDeviceState
    private var records: [UUID: PushDeviceReceipt] = [:]
    private var cancellations = Set<UUID>()
    private var commands: [PushDeviceCommand] = []
    private var paths: [String] = []
    private var loseSaveReply = false
    private var loseCancellationReply = false
    private var pauseSaveReply = false
    private var detailUnavailable = false
    private var waiting = false
    private var started: CheckedContinuation<Void, Never>?
    private var resume: CheckedContinuation<Void, Never>?

    init(member: VerifiedMember, installation: UUID) {
        self.member = member
        state = .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            installationId: installation, revision: nil, enabled: false, provider: nil, environment: nil)
    }

    func calls() -> [String] { paths }
    func saves() -> [PushDeviceCommand] { commands }
    func dropNextSaveReply() { loseSaveReply = true }
    func dropNextCancellationReply() { loseCancellationReply = true }
    func holdNextSaveReply() { pauseSaveReply = true }
    func failDetailReads() { detailUnavailable = true }
    func waitForSave() async {
        if waiting { return }
        await withCheckedContinuation { started = $0 }
    }
    func releaseSave() {
        resume?.resume()
        resume = nil
    }
    func rotate(enabled: Bool = false) {
        state = .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            installationId: state.installationId, revision: UUID(), enabled: enabled,
            provider: "apns", environment: .sandbox)
    }

    func respond(_ request: URLRequest) async throws -> (Data, URLResponse) {
        let path = request.url!.path
        paths.append(path)
        let data: Data
        switch path {
        case "/v1/push-devices/detail":
            if detailUnavailable { throw URLError(.notConnectedToInternet) }
            data = try JSONEncoder().encode(state)
        case "/v1/push-devices/save":
            let command = try JSONDecoder().decode(PushDeviceCommand.self, from: request.httpBody!)
            data = try JSONEncoder().encode(save(command))
            if pauseSaveReply {
                pauseSaveReply = false
                waiting = true
                started?.resume()
                started = nil
                await withCheckedContinuation { resume = $0 }
            }
            if loseSaveReply {
                loseSaveReply = false
                throw URLError(.networkConnectionLost)
            }
        case "/v1/push-devices/operation", "/v1/push-devices/cancel":
            let operation: UUID
            if path.hasSuffix("/cancel") {
                struct Operation: Decodable { let operationId: UUID }
                operation = try JSONDecoder().decode(Operation.self, from: request.httpBody!).operationId
                if records[operation] == nil { cancellations.insert(operation) }
            } else {
                let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)?.queryItems
                operation = UUID(uuidString: query!.first { $0.name == "operationId" }!.value!)!
            }
            let receipt = records[operation]
            let status: PushDeviceRecovery.Status =
                receipt != nil
                ? .recorded
                : cancellations.contains(operation) ? .cancelled : .unresolved
            data = try JSONEncoder().encode(
                PushDeviceRecovery(
                    version: 1, actorId: member.userId,
                    householdId: member.householdId, operationId: operation, status: status, receipt: receipt))
            if path.hasSuffix("/cancel"), loseCancellationReply {
                loseCancellationReply = false
                throw URLError(.networkConnectionLost)
            }
        default: throw NestAPIFailure.contract
        }
        return (data, HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }

    private func save(_ command: PushDeviceCommand) throws -> PushDeviceReceipt {
        if let previous = records[command.operationId] { return previous }
        guard !cancellations.contains(command.operationId), command.expectedRevision == state.revision else {
            throw NestAPIFailure.conflict
        }
        commands.append(command)
        let revision = UUID()
        let receipt = try PushDeviceReceipt(
            version: 1, actorId: member.userId, householdId: member.householdId,
            operationId: command.operationId, installationId: command.installationId,
            expectedRevision: command.expectedRevision, revision: revision, action: command.action,
            commandDigest: command.digest(member: member))
        records[command.operationId] = receipt
        state = .init(
            version: 1, actorId: member.userId, householdId: member.householdId,
            installationId: command.installationId, revision: revision, enabled: command.action == .register,
            provider: "apns", environment: command.environment ?? state.environment)
        return receipt
    }
}
