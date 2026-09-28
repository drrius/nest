import Foundation
import UIKit

extension SessionModel {
    func complete(_ chore: NestChore) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            let date = try CivilDate(formatter.string(from: .now))
            try await offline.enqueue(chore, on: date, operation: UUID(), lease: lease)
            guard generation == attempt, status == .ready(member) else { return }
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            todayNotice = "Could not save this change. Please try again."
            return
        }
        do {
            let saved = try await savedReader(offline, lease)
            guard generation == attempt, status == .ready(member) else { return }
            if let saved { today = .loaded(saved) }
            todayNotice = "Saved. This will sync when online."
            await refreshToday()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            todayNotice = "Saved on this device, but could not display the change. Try reopening Nest."
        }
    }

    func discard(_ operation: UUID) async {
        guard let offline, let lease, case .ready(let member) = status else { return }
        let attempt = generation
        do {
            try await offline.discard(operation, lease: lease)
            let saved = try await savedReader(offline, lease)
            guard generation == attempt, status == .ready(member) else { return }
            if let saved { today = .loaded(saved) }
            todayNotice = "Saved change discarded."
            await refreshToday()
        } catch {
            guard generation == attempt, status == .ready(member) else { return }
            todayNotice = "Could not discard this change. Please try again."
        }
    }
}
