import Combine
import Foundation

struct LegacyDismissalReview: Equatable {
    let identity: UUID
    let current: LegacyDraftContext
}

@MainActor
final class LegacyDismissalModel: ObservableObject {
    @Published private(set) var review: LegacyDismissalReview?
    @Published private(set) var saved: SavedLegacyDismissal?
    @Published private(set) var loaded = false
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let draftId: UUID?
    private var context: ExpenseContext?
    private var reviewEpoch = UUID()

    init(session: SessionModel, member: VerifiedMember, draftId: UUID?) {
        self.session = session
        self.member = member
        self.draftId = draftId
    }

    func load() async {
        guard !working else { return }
        working = true
        review = nil
        saved = nil
        loaded = false
        context = nil
        notice = nil
        defer { working = false }
        let generation = session.generation
        let epoch = UUID()
        reviewEpoch = epoch
        do {
            let current = try session.expenseContext()
            guard current.member == member else { throw NestAPIFailure.signedOut }
            let pending = try await session.savedLegacyDismissal(current)
            guard accept(generation), !Task.isCancelled else { return }
            context = current
            saved = pending
            if pending != nil {
                saved = try await session.checkLegacyDismissal(current)
            } else if let draftId {
                let value = try await session.readLegacyDraftContext(current, draftId: draftId)
                guard accept(generation), reviewEpoch == epoch, !Task.isCancelled else { return }
                review = .init(identity: UUID(), current: value)
            }
            guard accept(generation) else { return }
            loaded = true
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not verify this retained draft or saved dismissal. Try again online."
        }
    }

    func confirm(_ expected: LegacyDismissalReview) async {
        guard saved == nil, review == expected, expected.current.canDismiss else { return }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            try await self.session.stageLegacyDismissal(expected.current, context: context)
            self.saved = try await self.session.savedLegacyDismissal(context)
            self.review = nil
            self.saved = try await self.session.retryLegacyDismissal(context)
        }
    }

    func retry(cancel: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if cancel {
                self.saved = try await self.session.cancelLegacyDismissal(context)
            } else {
                self.saved = try await self.session.retryLegacyDismissal(context)
            }
        }
    }

    func finish() async -> Bool {
        guard let context, let saved, !working, accept(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishLegacyDismissal(context, operation: saved.command.operationId)
            guard accept(context.generation) else { return false }
            self.saved = nil
            review = nil
            return true
        } catch {
            guard accept(context.generation) else { return false }
            notice = "This dismissal needs a recorded or cancelled outcome before finishing recovery."
            return false
        }
    }

    func suspendReview() {
        reviewEpoch = UUID()
        review = nil
    }

    private func perform(_ work: () async throws -> Void) async {
        guard !working, let context, accept(context.generation) else { return }
        working = true
        notice = nil
        defer { working = false }
        do {
            try await work()
            _ = accept(context.generation)
        } catch {
            let pending = try? await session.savedLegacyDismissal(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice =
                pending == nil
                ? "Could not start dismissal. Reload and review the exact current draft online."
                : "Not confirmed. Check the saved result or explicitly cancel this pending request; its terms may have changed."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            reviewEpoch = UUID()
            review = nil
            saved = nil
            loaded = false
            notice = nil
            return false
        }
        return true
    }
}
