import Foundation

/// Device-local calendar and layer choices. These identifiers never enter a server payload.
@MainActor
final class CalendarSelectionStore {
    enum Purpose: String { case display, sharing, layers }

    private let defaults: UserDefaults
    private let key: String

    init(member: VerifiedMember, purpose: Purpose = .display, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = "nest.calendar.\(purpose.rawValue).\(member.householdId.uuidString).\(member.userId.uuidString)"
    }

    func read() -> Set<String> {
        Set(defaults.stringArray(forKey: key) ?? [])
    }

    func save(_ ids: Set<String>) {
        if ids.isEmpty {
            defaults.removeObject(forKey: key)
        } else {
            defaults.set(ids.sorted(), forKey: key)
        }
    }
}
