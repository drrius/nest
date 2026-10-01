import Combine
import Foundation

@MainActor
final class LegacyRecurringModel: ObservableObject {
    @Published private(set) var rules: [LegacyRecurringRule] = []
    @Published private(set) var next: UUID?
    @Published private(set) var loaded = false
    @Published private(set) var working = false
    @Published private(set) var notice: String?
    private let session: SessionModel
    private let member: VerifiedMember

    init(session: SessionModel, member: VerifiedMember) {
        self.session = session
        self.member = member
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
            let page = try await session.readLegacyRecurring(context, after: cursor)
            guard current(generation), !Task.isCancelled else { return }
            rules += page.rules
            next = page.next
            loaded = true
        } catch {
            guard current(generation), !Task.isCancelled else { return }
            clear()
            notice = "Could not load retained recurring expenses. Try again online."
        }
    }

    private func clear() {
        rules = []
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
