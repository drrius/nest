import Combine
import Foundation

@MainActor
final class LegacyDraftModel: ObservableObject {
    @Published private(set) var drafts: [LegacyRecurringDraft] = []
    @Published private(set) var next: UUID?
    @Published private(set) var loaded = false
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember
    private let ruleId: UUID

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID) {
        self.session = session
        self.member = member
        self.ruleId = ruleId
    }

    func load(more: Bool = false) async {
        guard !working, !more || next != nil else { return }
        working = true
        defer { working = false }
        let generation = session.generation
        guard current(generation) else { return }
        let cursor = more ? next : nil
        if !more { clear() }
        notice = nil
        do {
            let context = try session.expenseContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let page = try await session.readLegacyDrafts(context, ruleId: ruleId, after: cursor)
            guard current(generation), !Task.isCancelled else { return }
            drafts += page.drafts
            next = page.next
            loaded = true
        } catch {
            guard current(generation), !Task.isCancelled else { return }
            clear()
            notice = "Could not load retained drafts. Try again online."
        }
    }

    private func clear() {
        drafts = []
        next = nil
        loaded = false
        notice = nil
    }

    private func current(_ generation: Int) -> Bool {
        guard session.generation == generation, session.status == .ready(member) else {
            clear()
            return false
        }
        return true
    }
}
