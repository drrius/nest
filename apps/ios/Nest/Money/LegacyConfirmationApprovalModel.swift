import Combine
import Foundation

struct LegacyConfirmationProposalReview: Equatable {
    let identity: UUID
    let approval: LegacyConfirmationApproval
    let context: LegacyConfirmationProposalContext?
    let currentMembersMatch: Bool

    var canConfirm: Bool { context?.matches == true && currentMembersMatch }
}

@MainActor
final class LegacyConfirmationApprovalModel: ObservableObject {
    @Published private(set) var review: LegacyConfirmationProposalReview?
    @Published private(set) var members: [MoneyBalance.Member] = []
    @Published private(set) var saved: SavedLegacyConfirmationDecision?
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let approvalId: UUID
    private var context: ExpenseContext?
    private var reviewEpoch = UUID()

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        self.approvalId = approvalId
    }

    func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        review = nil
        members = []
        saved = nil
        notice = nil
        context = nil
        let epoch = UUID()
        reviewEpoch = epoch
        let generation = session.generation
        do {
            let current = try session.expenseContext()
            guard current.member == member else { throw NestAPIFailure.signedOut }
            let pending = try await session.savedLegacyConfirmationDecision(current)
            guard accept(generation), !Task.isCancelled else { return }
            context = current
            saved = pending
            if pending != nil {
                saved = try await session.checkLegacyConfirmationDecision(current)
                return
            }
            try await loadReview(current, generation: generation, epoch: epoch)
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not verify this private proposal or saved result. Try again online."
        }
    }

    func decide(_ approved: Bool, expected: LegacyConfirmationProposalReview) async {
        guard saved == nil, review == expected, !expected.approval.isTerminal
        else { return }
        if approved {
            guard expected.canConfirm, ApprovalTime.isOpen(expected.approval.expiresAt, now: .now) else {
                return
            }
        }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            let decision = LegacyConfirmationDecision(
                operationId: expected.approval.operationId, approvalId: expected.approval.id,
                input: expected.approval.input, approved: approved)
            try await self.session.stageLegacyConfirmationDecision(
                decision, reviewed: expected.context, context: context)
            self.saved = try await self.session.savedLegacyConfirmationDecision(context)
            self.review = nil
            self.saved = try await self.session.retryLegacyConfirmationDecision(context)
        }
    }

    func retry(withdraw: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if withdraw {
                self.saved = try await self.session.withdrawLegacyConfirmationDecision(context)
            } else {
                self.saved = try await self.session.retryLegacyConfirmationDecision(context)
            }
        }
    }

    func finish() async -> Bool {
        guard !working, let context, let saved, accept(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishLegacyConfirmationDecision(context, approvalId: saved.decision.approvalId)
            guard accept(context.generation) else { return false }
            self.saved = nil
            return true
        } catch {
            guard accept(context.generation) else { return false }
            notice = "Only a recorded expense or declined proposal can finish this saved decision."
            return false
        }
    }

    func suspendReview() {
        reviewEpoch = UUID()
        review = nil
    }

    private func loadReview(_ current: ExpenseContext, generation: Int, epoch: UUID) async throws {
        let approval = try await session.readLegacyConfirmationApproval(current, approvalId: approvalId).approval
        let proposalContext = try await reviewContext(current, approval: approval)
        let balance = try await session.readMoneyBalance(member: member, generation: generation)
        guard accept(generation), reviewEpoch == epoch, !Task.isCancelled else { return }
        members = balance.members
        let valid = (try? approval.input.expense.validated(member: member, balance: balance)) != nil
        review = .init(identity: UUID(), approval: approval, context: proposalContext, currentMembersMatch: valid)
    }

    private func reviewContext(_ current: ExpenseContext, approval: LegacyConfirmationApproval) async throws
        -> LegacyConfirmationProposalContext?
    {
        if approval.isTerminal { return nil }
        do {
            return try await session.readLegacyConfirmationProposalContext(current, approval: approval)
        } catch NestAPIFailure.forbidden {
            // The separately authorized private proposal can still be declined.
            return nil
        } catch NestAPIFailure.removed {
            return nil
        }
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
            let pending = try? await session.savedLegacyConfirmationDecision(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice = "Not confirmed. Check the saved result, retry this decision, or explicitly withdraw consent."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            reviewEpoch = UUID()
            review = nil
            members = []
            saved = nil
            notice = nil
            return false
        }
        return true
    }
}
