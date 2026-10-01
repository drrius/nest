import Foundation
import SwiftUI

@MainActor
final class AssistantRoutineModel: ObservableObject {
    enum Status: Equatable {
        case idle, loading
        case loaded(HouseholdRoutine?)
        case failed
    }
    @Published private(set) var status = Status.idle
    private var request = UUID()

    func load(session: SessionModel, member: VerifiedMember, receipt: RoutineCreateReceipt) async {
        let current = UUID()
        request = current
        status = .loading
        do {
            let context = try session.routineCreateContext()
            guard context.member == member, receipt.actorId == member.userId,
                receipt.householdId == member.householdId, ApprovalTime.date(receipt.version) != nil
            else { throw NestAPIFailure.signedOut }
            let page = try await session.readRoutines(context)
            let routine = page.routines.first { $0.id == receipt.routineId }
            if let routine {
                guard routine.version >= receipt.version else { throw ChoreContractError.invalidSnapshot }
            }
            guard request == current, !Task.isCancelled, session.status == .ready(member) else { return }
            status = .loaded(routine)
        } catch {
            guard request == current, !Task.isCancelled, session.status == .ready(member) else { return }
            status = .failed
        }
    }

    func clear() {
        invalidate()
        status = .idle
    }

    func invalidate() { request = UUID() }
}
