import Foundation

/// Device-local display choices only. These identifiers must never enter a server payload.
@MainActor
final class CalendarSelectionStore {
    private let defaults: UserDefaults
    private let key: String

    init(member: VerifiedMember, defaults: UserDefaults = .standard) {
        self.defaults = defaults
        key = "nest.calendar.display.\(member.householdId.uuidString).\(member.userId.uuidString)"
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
