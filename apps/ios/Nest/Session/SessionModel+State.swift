import Foundation

extension SessionModel {
    func state(for error: Error) -> Status {
        if let failure = error as? NestAPIFailure {
            if failure == .signedOut { return .signedOut }
            if failure == .notMember { return .notMember }
        }
        return .unavailable
    }
}
