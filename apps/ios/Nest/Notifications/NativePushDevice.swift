import Foundation
import SwiftUI
import UIKit
import UserNotifications

@MainActor
final class NativePushDevice: ObservableObject, NativePushHardware {
    let supported: Bool
    private let readPermission: @MainActor () async -> PushPermission
    private let askPermission: @MainActor () async throws -> PushPermission
    private let register: @MainActor () -> Void
    private let unregister: @MainActor () -> Void
    private let timeout: Duration
    private var pending: (id: UUID, continuation: CheckedContinuation<Data, any Error>)?
    private var deadline: Task<Void, Never>?

    init() {
        #if targetEnvironment(simulator)
            supported = false
        #else
            supported = true
        #endif
        timeout = .seconds(15)
        readPermission = Self.currentPermission
        askPermission = {
            do {
                _ = try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])
            } catch { throw NativePushFailure.permissionUnavailable }
            return await Self.currentPermission()
        }
        register = { UIApplication.shared.registerForRemoteNotifications() }
        unregister = { UIApplication.shared.unregisterForRemoteNotifications() }
    }

    init(
        supported: Bool, timeout: Duration = .seconds(15),
        permission: @escaping @MainActor () async -> PushPermission,
        requestPermission: @escaping @MainActor () async throws -> PushPermission,
        register: @escaping @MainActor () -> Void, unregister: @escaping @MainActor () -> Void
    ) {
        self.supported = supported
        self.timeout = timeout
        readPermission = permission
        askPermission = requestPermission
        self.register = register
        self.unregister = unregister
    }

    func permission() async -> PushPermission { await readPermission() }

    func requestPermission() async throws -> PushPermission {
        guard supported else { throw NativePushFailure.unsupported }
        let current = await permission()
        let result = current == .notAsked ? try await askPermission() : current
        guard result.allowsDelivery else { throw NativePushFailure.permissionDenied }
        return result
    }

    func captureToken(request: UUID) async throws -> Data {
        guard supported else { throw NativePushFailure.unsupported }
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                guard pending == nil else {
                    continuation.resume(throwing: NativePushFailure.busy)
                    return
                }
                pending = (request, continuation)
                deadline = Task {
                    do { try await Task.sleep(for: timeout) } catch { return }
                    finish(request: request, result: .failure(NativePushFailure.timedOut))
                }
                register()
            }
        } onCancel: {
            Task { @MainActor in self.cancelTokenRequest(request: request) }
        }
    }

    func didRegister(_ bytes: Data) {
        guard let pending else { return }
        let result: Result<Data, any Error> =
            (1...2048).contains(bytes.count)
            ? .success(bytes) : .failure(NativePushFailure.registrationFailed)
        finish(request: pending.id, result: result)
    }

    func didFailRegistration() {
        guard let pending else { return }
        finish(request: pending.id, result: .failure(NativePushFailure.registrationFailed))
    }

    func cancelTokenRequest(request: UUID) {
        finish(request: request, result: .failure(CancellationError()))
    }

    func disableLocalDelivery() { unregister() }

    private func finish(request: UUID, result: Result<Data, any Error>) {
        guard let pending, pending.id == request else { return }
        self.pending = nil
        deadline?.cancel()
        deadline = nil
        pending.continuation.resume(with: result)
    }

    private static func currentPermission() async -> PushPermission {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        return PushPermission(settings.authorizationStatus)
    }
}
