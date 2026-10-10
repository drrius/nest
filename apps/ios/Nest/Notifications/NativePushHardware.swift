import Foundation
import UserNotifications

enum PushPermission: Equatable, Sendable {
    case notAsked, denied, allowed, quiet, temporary, unknown

    init(_ status: UNAuthorizationStatus) {
        switch status {
        case .notDetermined: self = .notAsked
        case .denied: self = .denied
        case .authorized: self = .allowed
        case .provisional: self = .quiet
        case .ephemeral: self = .temporary
        @unknown default: self = .unknown
        }
    }

    var allowsDelivery: Bool { self == .allowed || self == .quiet }
}

enum NativePushFailure: Error, Equatable, Sendable {
    case unsupported, permissionDenied, permissionUnavailable, registrationFailed, timedOut, busy, sessionChanged
}

@MainActor
protocol NativePushHardware: AnyObject {
    var supported: Bool { get }
    func permission() async -> PushPermission
    func requestPermission() async throws -> PushPermission
    func captureToken(request: UUID) async throws -> Data
    func cancelTokenRequest(request: UUID)
    func disableLocalDelivery()
}
