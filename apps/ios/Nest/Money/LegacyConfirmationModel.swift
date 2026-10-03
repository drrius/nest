import Combine
import Foundation

struct LegacyConfirmationReview: Equatable {
    let identity: UUID
    let current: LegacyDraftContext
    let expense: ExpenseInput
}

@MainActor
final class LegacyConfirmationModel: ObservableObject {
    @Published private(set) var currentDraft: LegacyDraftContext?
    @Published private(set) var members: [MoneyBalance.Member] = []
    @Published private(set) var review: LegacyConfirmationReview?
    @Published private(set) var saved: SavedLegacyConfirmation?
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
        currentDraft = nil
        members = []
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
            let pending = try await session.savedLegacyConfirmation(current)
            guard accept(generation), !Task.isCancelled else { return }
            context = current
            saved = pending
            if pending != nil {
                saved = try await session.checkLegacyConfirmation(current)
            } else if let draftId {
                try await loadDraft(draftId, generation: generation, epoch: epoch)
            }
            guard accept(generation) else { return }
            loaded = true
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not verify this retained draft or saved confirmation. Try again online."
        }
    }

    private func loadDraft(_ draftId: UUID, generation: Int, epoch: UUID) async throws {
        guard let context else { throw NestAPIFailure.signedOut }
        let value = try await session.readLegacyDraftContext(context, draftId: draftId)
        let balance = try await session.readMoneyBalance(member: member, generation: generation)
        guard accept(generation), reviewEpoch == epoch, !Task.isCancelled else { return }
        currentDraft = value
        members = balance.members
    }

    func prepare(_ expense: ExpenseInput) throws {
        guard !working, saved == nil, let currentDraft, currentDraft.canDismiss, let context,
            accept(context.generation)
        else { throw NestAPIFailure.conflict }
        _ = try LegacyConfirmInput(
            draftId: currentDraft.draft.id, ruleId: currentDraft.draft.ruleId,
            reviewToken: currentDraft.reviewToken, expense: expense
        ).validated(member: member)
        guard Set(expense.allocations.map(\.memberId)) == Set(members.map(\.id)) else {
            throw NestAPIFailure.conflict
        }
        review = .init(identity: UUID(), current: currentDraft, expense: expense)
    }

    func edit() { review = nil }

    func confirm(_ expected: LegacyConfirmationReview) async {
        guard saved == nil, review == expected, expected.current.canDismiss else { return }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            try await self.session.stageLegacyConfirmation(
                expected.current, expense: expected.expense, context: context)
            self.saved = try await self.session.savedLegacyConfirmation(context)
            self.review = nil
            self.saved = try await self.session.retryLegacyConfirmation(context)
        }
    }

    func retry(cancel: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if cancel {
                self.saved = try await self.session.cancelLegacyConfirmation(context)
            } else {
                self.saved = try await self.session.retryLegacyConfirmation(context)
            }
        }
    }

    func finish() async -> Bool {
        guard let context, let saved, !working, accept(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishLegacyConfirmation(context, operation: saved.command.operationId)
            guard accept(context.generation) else { return false }
            self.saved = nil
            review = nil
            return true
        } catch {
            guard accept(context.generation) else { return false }
            notice = "This confirmation needs a recorded or cancelled outcome before finishing recovery."
            return false
        }
    }

    func suspendReview() {
        reviewEpoch = UUID()
        review = nil
        currentDraft = nil
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
            let pending = try? await session.savedLegacyConfirmation(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice =
                pending == nil
                ? "Could not start confirmation. Reload and review the exact current draft online."
                : "Not confirmed. Check the saved result or explicitly cancel this pending request; its terms or household members may have changed."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            reviewEpoch = UUID()
            review = nil
            currentDraft = nil
            members = []
            saved = nil
            loaded = false
            notice = nil
            return false
        }
        return true
    }
}
