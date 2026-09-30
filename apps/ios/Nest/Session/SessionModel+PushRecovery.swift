import Foundation

extension SessionModel {
    func recoverPushDevice(_ context: NotificationContext, cancel: Bool = false, retry: Bool = false) async throws {
        guard let offline, let notificationAPI, var saved = try await savedPushDeviceRequest(context) else {
            throw OfflineFailure.invalidOperation
        }
        if cancel {
            try await offline.requestPushDeviceCancellation(lease: context.lease)
            try requireNotificationAccount(context)
            guard let latest = try await savedPushDeviceRequest(context) else { throw OfflineFailure.invalidOperation }
            saved = latest
        }
        guard saved.result?.status == nil || saved.result?.status == .unresolved else { return }
        let token = try await notificationToken(context)
        let result = try await notificationAPI.recoverPushDevice(
            token: token, member: context.member, command: saved.command, cancel: saved.cancellationRequested)
        try requireNotificationAccount(context)
        try await offline.recordPushDeviceRecovery(result, lease: context.lease)
        try requireNotificationAccount(context)
        guard result.status == .unresolved, retry, !saved.cancellationRequested else { return }
        try await sendOriginalPushDevice(saved, context: context)
    }

    private func sendOriginalPushDevice(_ saved: SavedPushDeviceRequest, context: NotificationContext) async throws {
        guard let notificationAPI, let offline else { throw NestAPIFailure.configuration }
        let token = try await notificationToken(context)
        let identity = try PushTokenIdentity(token: token, expectedActor: context.member.userId)
        guard identity.session == saved.sessionId else { throw NativePushFailure.sessionChanged }
        if saved.command.action == .register {
            guard case .available(let environment) = pushBuild, environment == saved.command.environment else {
                throw NestAPIFailure.configuration
            }
        }
        try Task.checkCancellation()
        let receipt = try await notificationAPI.savePushDevice(
            token: token, member: context.member, command: saved.command)
        try requireNotificationAccount(context)
        let result = PushDeviceRecovery(
            version: 1, actorId: context.member.userId, householdId: context.member.householdId,
            operationId: saved.command.operationId, status: .recorded, receipt: receipt)
        try await offline.recordPushDeviceRecovery(result, lease: context.lease)
        try requireNotificationAccount(context)
    }
}
