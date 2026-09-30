import Foundation

enum PushDeviceNotice {
    static func message(_ error: any Error) -> String {
        switch error {
        case NativePushFailure.permissionDenied:
            "Notifications are off in iPhone Settings. You can change permission there, then connect again."
        case NativePushFailure.permissionUnavailable:
            "Could not check notification permission. Reload and try again."
        case NativePushFailure.registrationFailed, NativePushFailure.timedOut:
            "Apple did not confirm a device token. No new Nest connection was saved. Try again when connected."
        case NativePushFailure.sessionChanged:
            "This saved request belongs to an earlier sign-in. Check or cancel it; it will not be resent."
        case NativePushFailure.unsupported:
            "Real notification enrollment needs an iPhone. Simulator injection does not connect to Apple’s delivery service."
        default:
            "The change is not confirmed. Check any saved request before trying a new connection."
        }
    }
}
