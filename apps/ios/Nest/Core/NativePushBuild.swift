import Foundation

enum NativePushBuild: Equatable, Sendable {
    case disabled, signingMissing
    case available(PushEnvironment)

    init(enabled: Bool, entitlement: String?) {
        guard enabled else {
            self = .disabled
            return
        }
        switch entitlement {
        case "development": self = .available(.sandbox)
        case "production": self = .available(.production)
        default: self = .signingMissing
        }
    }
}
