import Combine
import Foundation

@MainActor
final class ManualCycleApprovalModel: ObservableObject {
    @Published private(set) var proposal: ManualCycleApproval?
    @Published private(set) var proposalContext: ManualCycleContext?
    @Published private(set) var saved: SavedManualCycleDecision?
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let approvalId: UUID
    private var context: ExpenseContext?

    init(session: SessionModel, member: VerifiedMember, approvalId: UUID) {
        self.session = session
        self.member = member
        self.approvalId = approvalId
    }

    func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        proposal = nil
        proposalContext = nil
        saved = nil
        notice = nil
        context = nil
        let generation = session.generation
        do {
            let current = try session.expenseContext()
            guard current.member == member else { throw NestAPIFailure.signedOut }
            let decision = try await session.savedManualCycleDecision(current)
            if let decision {
                guard acceptCurrentAccount(generation) else { return }
                context = current
                saved = decision
                return
            }
            let envelope = try await session.readManualCycleApproval(current, approvalId: approvalId)
            let proposalContext = try await session.readManualCycleProposalContext(current, approval: envelope.approval)
            guard acceptCurrentAccount(generation), !Task.isCancelled else { return }
            context = current
            proposal = envelope.approval
            self.proposalContext = proposalContext
        } catch {
            guard acceptCurrentAccount(generation), !Task.isCancelled else { return }
            notice = "Could not load this private proposal. Try again online."
        }
    }

    func decide(_ approved: Bool) async {
        guard let proposal, saved == nil, proposal.status == .pending,
            ApprovalTime.isOpen(proposal.expiresAt, now: .now), let proposalContext,
            !approved || proposalContext.matches
        else { return }
        await send(
            .init(
                operationId: proposal.operationId, approvalId: proposal.id,
                input: proposal.input, approved: approved))
    }

    func retry() async { await send(nil) }

    private func send(_ decision: ManualCycleDecision?) async {
        guard !working, let context, acceptCurrentAccount(context.generation) else { return }
        working = true
        notice = nil
        defer { working = false }
        do {
            if let decision { try await session.stageManualCycleDecision(decision, context: context) }
            let result = try await session.retryManualCycleDecision(context)
            guard acceptCurrentAccount(context.generation) else { return }
            saved = result
            proposal = nil
            proposalContext = nil
        } catch {
            let pending = try? await session.savedManualCycleDecision(context)
            guard acceptCurrentAccount(context.generation) else { return }
            saved = pending
            notice =
                "Could not confirm this decision. Check again online; the expense or bill may have changed or the proposal expired."
        }
    }

    func finish() async -> Bool {
        guard !working, let context, let saved, acceptCurrentAccount(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishManualCycleDecision(context, approvalId: saved.decision.approvalId)
            guard acceptCurrentAccount(context.generation) else { return false }
            self.saved = nil
            return true
        } catch {
            guard acceptCurrentAccount(context.generation) else { return false }
            notice = "Could not finish recovery. Check the saved decision again."
            return false
        }
    }

    private func acceptCurrentAccount(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            proposal = nil
            proposalContext = nil
            saved = nil
            context = nil
            notice = nil
            return false
        }
        return true
    }
}
