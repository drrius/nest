import Combine
import Foundation

struct LegacyAdoptionReview: Equatable {
    let identity: UUID
    let current: LegacyAdoptionContext
    let input: LegacyAdoptionInput
}

@MainActor
final class LegacyAdoptionModel: ObservableObject {
    @Published private(set) var currentRule: LegacyAdoptionContext?
    @Published private(set) var today: CivilDate?
    @Published private(set) var members: [MoneyBalance.Member] = []
    @Published private(set) var review: LegacyAdoptionReview?
    @Published private(set) var saved: SavedLegacyAdoption?
    @Published private(set) var loaded = false
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let ruleId: UUID?
    private var context: ExpenseContext?
    private var reviewEpoch = UUID()

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID?) {
        self.session = session
        self.member = member
        self.ruleId = ruleId
    }

    func load() async {
        guard !working else { return }
        working = true
        review = nil
        currentRule = nil
        members = []
        today = nil
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
            let pending = try await session.savedLegacyAdoption(current)
            guard accept(generation), !Task.isCancelled else { return }
            context = current
            saved = pending
            if pending != nil {
                saved = try await session.checkLegacyAdoption(current)
            } else if let ruleId {
                try await loadRule(ruleId, generation: generation, epoch: epoch)
            }
            guard accept(generation) else { return }
            loaded = true
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not verify this retained rule or saved adoption. Try again online."
        }
    }

    private func loadRule(_ ruleId: UUID, generation: Int, epoch: UUID) async throws {
        guard let context else { throw NestAPIFailure.signedOut }
        let value = try await session.readLegacyAdoptionContext(context, ruleId: ruleId)
        let balance = try await session.readMoneyBalance(member: member, generation: generation)
        let day = try await session.readRecurringRules(context, after: nil, dueOnly: false).today
        guard accept(generation), reviewEpoch == epoch, !Task.isCancelled else { return }
        today = day
        currentRule = value
        members = balance.members
    }

    func prepare(_ draft: RecurringDraft) throws {
        guard !working, saved == nil, let currentRule, currentRule.canAdopt, let context, let today,
            accept(context.generation)
        else { throw NestAPIFailure.conflict }
        let config = try draft.reviewed(member: member, members: members.map(\.id), today: today).configuration
        guard config.startDate.value >= today.value,
            let first = try RecurringDates.firstUncovered(
                schedule: config.schedule, from: config.startDate, coveredThrough: currentRule.coveredThrough)
        else { throw NestAPIFailure.invalid }
        let input = try LegacyAdoptionInput(
            ruleId: currentRule.rule.id, reviewToken: currentRule.reviewToken,
            configuration: config, firstDueOn: first
        ).validated(member: member)
        review = .init(identity: UUID(), current: currentRule, input: input)
    }

    func edit() { review = nil }

    func confirm(_ expected: LegacyAdoptionReview) async {
        guard saved == nil, review == expected, expected.current.canAdopt else { return }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            try await self.session.stageLegacyAdoption(
                expected.current, input: expected.input, context: context)
            self.saved = try await self.session.savedLegacyAdoption(context)
            self.review = nil
            self.saved = try await self.session.retryLegacyAdoption(context)
        }
    }

    func retry(cancel: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if cancel {
                self.saved = try await self.session.cancelLegacyAdoption(context)
            } else {
                self.saved = try await self.session.retryLegacyAdoption(context)
            }
        }
    }

    func finish() async -> Bool {
        guard let context, let saved, !working, accept(context.generation) else { return false }
        working = true
        defer { working = false }
        do {
            try await session.finishLegacyAdoption(context, operation: saved.command.operationId)
            guard accept(context.generation) else { return false }
            self.saved = nil
            review = nil
            return true
        } catch {
            guard accept(context.generation) else { return false }
            notice = "This adoption needs a recorded or cancelled outcome before finishing recovery."
            return false
        }
    }

    func suspendReview() {
        reviewEpoch = UUID()
        review = nil
        currentRule = nil
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
            let pending = try? await session.savedLegacyAdoption(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice =
                pending == nil
                ? "Could not start adoption. Reload and review the exact current rule online."
                : "Not adopted. Check the saved result or explicitly cancel this pending request; its terms or household members may have changed."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            reviewEpoch = UUID()
            review = nil
            currentRule = nil
            members = []
            today = nil
            saved = nil
            loaded = false
            notice = nil
            return false
        }
        return true
    }
}
