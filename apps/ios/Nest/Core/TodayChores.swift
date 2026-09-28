import Foundation

extension LocalChore {
    func visibleToday(on day: CivilDate, actor: UUID, everyone: Bool) -> Bool {
        // Recovery remains reachable even if the server moved the chore or reassigned it.
        if state == .pending || state == .conflict { return true }
        return chore.dueDate.value <= day.value
            && (everyone || chore.assigneeId == nil || chore.assigneeId == actor)
    }
}
