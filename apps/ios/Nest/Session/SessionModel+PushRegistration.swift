import Foundation

extension SessionModel {
    func pushInstallationId(_ context: NotificationContext) throws -> UUID {
        try requireNotificationAccount(context)
        guard let pushInstallation else { throw NestAPIFailure.configuration }
        return try pushInstallation.read()
    }

    func savedPushDeviceRequest(_ context: NotificationContext) async throws -> SavedPushDeviceRequest? {
        try requireNotificationAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let saved = try await offline.readPushDeviceRequest(lease: context.lease)
        try requireNotificationAccount(context)
        return saved
    }

    func readPushDevice(_ context: NotificationContext) async throws -> PushDeviceState {
        let installation = try pushInstallationId(context)
        let token = try await notificationToken(context)
        guard let notificationAPI else { throw NestAPIFailure.configuration }
        let result = try await notificationAPI.pushDevice(
            token: token, member: context.member, installation: installation)
        try requireNotificationAccount(context)
        return result
    }

    func hasTrackedPushSession(_ context: NotificationContext) async throws -> Bool {
        try requireNotificationAccount(context)
        guard let offline else { throw NestAPIFailure.configuration }
        let sessions = try await offline.trackedPushSessions(actor: context.member.userId)
        try requireNotificationAccount(context)
        return !sessions.isEmpty
    }

    func preflightPushConnection(_ context: NotificationContext, baseline: PushDeviceState) async throws {
        guard case .available = pushBuild, let offline else { throw NestAPIFailure.configuration }
        guard try await savedPushDeviceRequest(context) == nil else { throw OfflineFailure.alreadyQueued }
        guard try await !offline.hasPendingPushCleanup() else { throw OfflineFailure.sessionChanged }
        try requireNotificationAccount(context)
        let current = try await readPushDevice(context)
        guard current == baseline else { throw NestAPIFailure.conflict }
    }

    func stagePushDevice(
        baseline: PushDeviceState, action: PushDeviceCommand.Action, bytes: Data? = nil,
        context: NotificationContext
    ) async throws {
        let installation = try pushInstallationId(context)
        _ = try baseline.validated(member: context.member, installation: installation)
        guard let notificationAPI, let offline else { throw NestAPIFailure.configuration }
        let token = try await notificationToken(context)
        let identity = try PushTokenIdentity(token: token, expectedActor: context.member.userId)
        let current = try await notificationAPI.pushDevice(
            token: token, member: context.member, installation: installation)
        try requireNotificationAccount(context)
        guard current == baseline else { throw NestAPIFailure.conflict }
        let command = try pushDeviceCommand(baseline: baseline, action: action, bytes: bytes)
        try await offline.stagePushDeviceRequest(
            .init(baseline: current, command: command, sessionId: identity.session), lease: context.lease)
        try requireNotificationAccount(context)
    }

    func finishPushDeviceRequest(_ context: NotificationContext) async throws {
        guard let saved = try await savedPushDeviceRequest(context), let offline else {
            throw OfflineFailure.invalidOperation
        }
        try await offline.finishPushDeviceRequest(operation: saved.command.operationId, lease: context.lease)
        try requireNotificationAccount(context)
    }

    private func pushDeviceCommand(
        baseline: PushDeviceState, action: PushDeviceCommand.Action, bytes: Data?
    ) throws -> PushDeviceCommand {
        if action == .disable {
            guard bytes == nil else { throw NestAPIFailure.invalid }
            return .init(
                operationId: UUID(), installationId: baseline.installationId,
                expectedRevision: baseline.revision, action: action)
        }
        guard case .available(let environment) = pushBuild, let bytes else { throw NestAPIFailure.configuration }
        return try .init(
            operationId: UUID(), installationId: baseline.installationId,
            expectedRevision: baseline.revision, action: action,
            token: PushDeviceCommand.tokenBytes(bytes), environment: environment
        ).validated()
    }
}
