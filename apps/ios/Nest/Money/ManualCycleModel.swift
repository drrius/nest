import Combine
import Foundation

struct ManualCycleReview {
    let input: ManualCycleInput
    let target: RecurringDetail
    let source: MoneyDetail
}

@MainActor
final class ManualCycleModel: ObservableObject {
    @Published private(set) var target: RecurringDetail?
    @Published private(set) var events: [MoneyEventSummary] = []
    @Published private(set) var next: UUID?
    @Published private(set) var review: ManualCycleReview?
    @Published private(set) var saved: SavedManualCycle?
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let ruleId: UUID
    private var context: ExpenseContext?

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID) {
        self.session = session
        self.member = member
        self.ruleId = ruleId
    }

    func load(more: Bool = false) async {
        guard !working, !more || next != nil else { return }
        working = true
        notice = nil
        defer { working = false }
        let generation = session.generation
        do {
            let current = try session.expenseContext()
            guard current.member == member else { throw NestAPIFailure.signedOut }
            let pending = try await session.savedManualCycle(current)
            guard accept(generation) else { return }
            context = current
            saved = pending
            if !more {
                review = nil
                target = nil
                events = []
                next = nil
            }
            guard pending == nil else { return }
            let detail = try await session.readRecurringRule(current, ruleId: ruleId)
            let page = try await session.readMoneyHistory(member: member, generation: generation, before: next)
            guard accept(generation), !Task.isCancelled else { return }
            try validatePage(page)
            target = detail
            events.append(contentsOf: page.events)
            next = page.next
        } catch {
            guard accept(generation), !Task.isCancelled else { return }
            notice = "Could not load this bill and its expense history. Try again online."
        }
    }

    func select(_ eventId: UUID) async {
        guard !working, saved == nil, let context, accept(context.generation) else { return }
        working = true
        review = nil
        notice = nil
        defer { working = false }
        do {
            let detail = try await session.readRecurringRule(context, ruleId: ruleId)
            let source = try await session.readMoneyDetail(
                member: member, generation: context.generation, eventId: eventId)
            let balance = try await session.readMoneyBalance(member: member, generation: context.generation)
            guard let cycle = detail.manualCycle else { throw NestAPIFailure.conflict }
            let input = ManualCycleInput(
                ruleId: ruleId, expectedRevision: detail.rule.revision, dueOn: cycle.dueOn, sourceEventId: eventId)
            try input.validated(member: member, balance: balance, target: detail, source: source)
            guard accept(context.generation), !Task.isCancelled else { return }
            target = detail
            review = .init(input: input, target: detail, source: source)
        } catch {
            guard accept(context.generation), !Task.isCancelled else { return }
            notice = "This expense or cycle is no longer eligible. Refresh and select an existing expense again."
        }
    }

    func edit() { review = nil }

    func confirm() async {
        guard let review else { return }
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            try await self.session.stageManualCycle(review.input, context: context)
            self.saved = try await self.session.savedManualCycle(context)
            self.review = nil
            self.saved = try await self.session.retryManualCycle(context)
        }
    }

    func retry(cancel: Bool = false) async {
        await perform {
            guard let context = self.context else { throw NestAPIFailure.signedOut }
            if cancel {
                self.saved = try await self.session.cancelManualCycle(context)
            } else {
                self.saved = try await self.session.retryManualCycle(context)
            }
        }
    }

    func finish() async {
        await perform {
            guard let context = self.context, let saved = self.saved else { throw OfflineFailure.invalidOperation }
            try await self.session.finishManualCycle(context, operation: saved.command.operationId)
            self.saved = nil
            self.review = nil
            self.target = nil
            self.events = []
            self.next = nil
        }
    }

    var candidates: [MoneyEventSummary] {
        guard let cycle = target?.manualCycle else { return [] }
        return events.filter {
            [.expense, .replacement].contains($0.kind) && $0.occurredOn >= cycle.startsOn.value
                && $0.occurredOn <= cycle.through.value
        }
    }

    private func validatePage(_ page: MoneyHistory) throws {
        guard let last = events.last, let first = page.events.first else { return }
        guard last.precedes(first), Set(events.map(\.id)).isDisjoint(with: page.events.map(\.id)) else {
            throw NestAPIFailure.contract
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
            let pending = try? await session.savedManualCycle(context)
            guard accept(context.generation) else { return }
            saved = pending
            notice =
                pending == nil
                ? "Could not start this link. Reload and review the current expense and bill online."
                : "This link is not confirmed yet. Check its saved result or explicitly cancel the pending link."
        }
    }

    private func accept(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            context = nil
            target = nil
            events = []
            next = nil
            review = nil
            saved = nil
            notice = nil
            return false
        }
        return true
    }
}
