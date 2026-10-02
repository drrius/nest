import Combine
import Foundation

struct LegacyDismissalProposalReview: Equatable {
    let identity: UUID
    let approval: LegacyDismissalApproval
    let context: LegacyDismissalProposalContext?
}

@MainActor
final class LegacyDismissalApprovalModel: ObservableObject {
    @Published private(set) var review: LegacyDismissalProposalReview?
    @Published private(set) var saved: SavedLegacyDismissalDecision?
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
        saved = nil
        notice = nil
        context = nil
        let epoch = UUID()
        reviewEpoch = epoch
        let generation = session.generation
        do {
            let current = try session.expenseContext()
            guard current.member == member else { throw NestAPIFailure.signedOut }
            let pending = try await session.savedLegacyDismissalDecision(current)
            guard accept(generation), !Task.isCancelled else { return }
            context = current
            saved = pending
            if pending != nil {
                saved = try await session.checkLegacyDismissalDecision(current)
                return
            }
            let approval = try await session.readLegacyDismissalApproval(current, approvalId: approvalId).approval
            let proposalContext =
                approval.isTerminal
                ? nil : try await session.readLegacyDismissalProposalContext(current, approval: approval)
            guard accept(generation), reviewEpoch == epoch, !Task.isCancelled else { return }
            review = .init(identity: UUID(), approval: approval, context: proposalContext)
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not verify this private proposal or saved result. Try again online."
        }
    }

    func decide(_ approved: Bool, expected: LegacyDismissalProposalReview) async {
        guard saved == nil, review == expected, !expected.approval.isTerminal, let reviewed = expected.context,
            !approved || (reviewed.matches && ApprovalTime.isOpen(expected.approval.expiresAt, now: .now))
        else { return }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            let decision = LegacyDismissalDecision(
                operationId: expected.approval.operationId, approvalId: expected.approval.id,
                input: expected.approval.input, approved: approved)
            try await self.session.stageLegacyDismissalDecision(decision, reviewed: reviewed, context: context)
            self.saved = try await self.session.savedLegacyDismissalDecision(context)
            self.review = nil
            self.saved = try await self.session.retryLegacyDismissalDecision(context)
        }
    }

    func retry(withdraw: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if withdraw {
                self.saved = try await self.session.withdrawLegacyDismissalDecision(context)
            } else {
                self.saved = try await self.session.retryLegacyDismissalDecision(context)
            }
        }
    }

    func finish() async -> Bool {
        guard !working, let context, let saved, accept(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishLegacyDismissalDecision(context, approvalId: saved.decision.approvalId)
            guard accept(context.generation) else { return false }
            self.saved = nil
            return true
        } catch {
            guard accept(context.generation) else { return false }
            notice = "Only a recorded dismissal or declined proposal can finish this saved decision."
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
            let pending = try? await session.savedLegacyDismissalDecision(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice = "Not confirmed. Reload the private result, retry the exact decision, or explicitly withdraw consent."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            reviewEpoch = UUID()
            review = nil
            saved = nil
            notice = nil
            return false
        }
        return true
    }
}
