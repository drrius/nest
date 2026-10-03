import Combine
import Foundation

@MainActor
final class LegacyDecisionRecoveryModel: ObservableObject {
    @Published private(set) var confirmation: SavedLegacyConfirmationDecision?
    @Published private(set) var dismissal: SavedLegacyDismissalDecision?
    @Published private(set) var notice: String?
    @Published private(set) var working = false
    private let session: SessionModel
    private let member: VerifiedMember

    init(session: SessionModel, member: VerifiedMember) {
        self.session = session
        self.member = member
    }

    /// Recovery remains reachable without a pending server-list row or connectivity.
    func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        confirmation = nil
        dismissal = nil
        notice = nil
        let generation = session.generation
        do {
            let context = try session.expenseContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let confirmation = try await session.savedLegacyConfirmationDecision(context)
            let dismissal = try await session.savedLegacyDismissalDecision(context)
            guard session.generation == generation, session.status == .ready(member), !Task.isCancelled else { return }
            self.confirmation = confirmation
            self.dismissal = dismissal
        } catch {
            guard session.generation == generation, session.status == .ready(member), !Task.isCancelled else { return }
            notice = "Could not read your saved draft decisions. Try checking again."
        }
    }
}
