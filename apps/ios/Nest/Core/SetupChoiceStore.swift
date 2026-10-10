import CryptoKit
import Foundation

enum SetupChoice: String, Codable, Sendable { case quick, comprehensive }

/// Local first-use presentation metadata only. Never a preference, permission or feature-completion record.
@MainActor
final class SetupChoiceStore {
    private let defaults: UserDefaults
    private let environment: String

    init(environment: URL, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.environment = SHA256.hash(data: Data(environment.absoluteString.utf8))
            .map { String(format: "%02x", $0) }.joined()
    }

    func read(member: VerifiedMember) -> SetupChoice? {
        defaults.string(forKey: key(member)).flatMap(SetupChoice.init(rawValue:))
    }

    func save(_ choice: SetupChoice, member: VerifiedMember) throws {
        defaults.set(choice.rawValue, forKey: key(member))
        guard read(member: member) == choice else { throw OfflineFailure.storage }
    }

    private func key(_ member: VerifiedMember) -> String {
        "nest.first-use.v1.\(environment).\(member.householdId.uuidString).\(member.userId.uuidString)"
    }
}
