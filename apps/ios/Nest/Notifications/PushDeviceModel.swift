import Foundation
import SwiftUI

@MainActor
final class PushDeviceModel: ObservableObject {
    @Published private(set) var baseline: PushDeviceState?
    @Published private(set) var saved: SavedPushDeviceRequest?
    @Published private(set) var permission = PushPermission.unknown
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var request = UUID()
    private var capture: UUID?

    func load(session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware) async {
        guard !busy else { return }
        let attempt = begin()
        baseline = nil
        saved = nil
        defer { finish(attempt) }
        do {
            let context = try context(session, member)
            let currentPermission = await hardware.permission()
            try require(attempt, session: session, context: context)
            permission = currentPermission
            let pending = try await session.savedPushDeviceRequest(context)
            try require(attempt, session: session, context: context)
            saved = pending
            let tracked = try await session.hasTrackedPushSession(context)
            try require(attempt, session: session, context: context)
            var state: PushDeviceState?
            if case .available = session.pushBuild {
                state = try await session.readPushDevice(context)
            } else if pending != nil || tracked {
                state = try await session.readPushDevice(context)
            }
            try require(attempt, session: session, context: context)
            baseline = state
        } catch {
            guard request == attempt else { return }
            if session.status != .ready(member) || error as? NestAPIFailure == .signedOut { clear(hardware: hardware) }
            notice = "Could not check this iPhone’s notification connection. Reload when connected."
        }
    }

    func connect(session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware) async {
        guard let baseline, saved == nil else { return }
        await perform(session: session, member: member, hardware: hardware) { context, attempt in
            guard hardware.supported else { throw NativePushFailure.unsupported }
            try await session.preflightPushConnection(context, baseline: baseline)
            try self.require(attempt, session: session, context: context)
            let permission = try await hardware.requestPermission()
            try self.require(attempt, session: session, context: context)
            self.permission = permission
            self.capture = attempt
            let bytes = try await hardware.captureToken(request: attempt)
            try self.require(attempt, session: session, context: context)
            self.capture = nil
            try await session.stagePushDevice(baseline: baseline, action: .register, bytes: bytes, context: context)
            try self.require(attempt, session: session, context: context)
            try await session.recoverPushDevice(context, retry: true)
        }
    }

    func disconnect(session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware) async {
        guard let baseline, baseline.enabled, saved == nil else { return }
        await perform(session: session, member: member, hardware: hardware) { context, _ in
            try await session.stagePushDevice(baseline: baseline, action: .disable, context: context)
            try await session.recoverPushDevice(context, retry: true)
        }
    }

    func recover(
        session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware,
        cancel: Bool = false, retry: Bool = false
    ) async {
        await perform(session: session, member: member, hardware: hardware) { context, _ in
            if retry, self.saved?.command.action == .register {
                guard hardware.supported else { throw NativePushFailure.unsupported }
                let permission = await hardware.permission()
                guard permission.allowsDelivery else { throw NativePushFailure.permissionDenied }
            }
            try await session.recoverPushDevice(context, cancel: cancel, retry: retry)
        }
    }

    func continueAfterResult(session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware) async {
        await perform(session: session, member: member, hardware: hardware) { context, _ in
            try await session.finishPushDeviceRequest(context)
        }
        if saved == nil { await load(session: session, member: member, hardware: hardware) }
    }

    func clear(hardware: any NativePushHardware) {
        if let capture { hardware.cancelTokenRequest(request: capture) }
        capture = nil
        request = UUID()
        busy = false
        baseline = nil
        saved = nil
        permission = .unknown
        notice = nil
    }

    private func perform(
        session: SessionModel, member: VerifiedMember, hardware: any NativePushHardware,
        action: (NotificationContext, UUID) async throws -> Void
    ) async {
        guard !busy else { return }
        let attempt = begin()
        defer { finish(attempt) }
        do {
            let context = try context(session, member)
            do { try await action(context, attempt) } catch {
                try require(attempt, session: session, context: context)
                notice = PushDeviceNotice.message(error)
            }
            let pending = try await session.savedPushDeviceRequest(context)
            try require(attempt, session: session, context: context)
            saved = pending
            if pending?.result?.status == .recorded, pending?.command.action == .disable {
                hardware.disableLocalDelivery()
            }
        } catch {
            guard request == attempt else { return }
            baseline = nil
            if session.status != .ready(member) || error as? NestAPIFailure == .signedOut { clear(hardware: hardware) }
            notice = "Could not check the saved request. Sign in and reload before changing this connection."
        }
    }

    private func context(_ session: SessionModel, _ member: VerifiedMember) throws -> NotificationContext {
        let context = try session.notificationContext()
        guard context.member == member else { throw NestAPIFailure.signedOut }
        return context
    }

    private func require(_ attempt: UUID, session: SessionModel, context: NotificationContext) throws {
        guard request == attempt, !Task.isCancelled else { throw CancellationError() }
        try session.requireNotificationAccount(context)
    }

    private func begin() -> UUID {
        request = UUID()
        busy = true
        notice = nil
        return request
    }

    private func finish(_ attempt: UUID) { if request == attempt { busy = false } }
}
