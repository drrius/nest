import Foundation

enum ChoreConflictReason: String, Sendable {
    case changed, removed, forbidden, cutover

    var message: String {
        switch self {
        case .changed: "This chore changed. Your saved completion was not applied."
        case .removed: "This chore is no longer available. Your saved completion was not applied."
        case .forbidden: "Nest refused this saved completion. Review your access before trying again."
        case .cutover: "This saved completion can no longer be applied."
        }
    }
}

extension LocalChore {
    func visibleToday(on day: CivilDate, actor: UUID, everyone: Bool) -> Bool {
        // Recovery remains reachable even if the server moved the chore or reassigned it.
        if state == .pending || state == .conflict { return true }
        return chore.dueDate.value <= day.value
            && (everyone || chore.assigneeId == nil || chore.assigneeId == actor)
    }
}
