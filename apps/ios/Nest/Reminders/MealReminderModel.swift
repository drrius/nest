import Foundation
import SwiftUI

@MainActor
final class MealReminderModel: ObservableObject {
    @Published var settings = MealReminderModel.defaults
    @Published private(set) var baseline: MealReminderContext?
    @Published private(set) var members: [NestMember] = []
    @Published private(set) var saved: SavedMealReminderRequest?
    @Published private(set) var loaded = false
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var request = UUID()
    static var defaults: ReminderSettings { .init(enabled: false, recipientIds: [], localTime: "08:00", daysBefore: 0) }
    var dirty: Bool { loaded && saved == nil && settings != (baseline?.reminder?.settings ?? Self.defaults) }
    var canSave: Bool {
        loaded && !busy && saved == nil
            && (try? settings.validated(members: members.map(\.actorId))) != nil
    }

    func clear() {
        request = UUID()
        settings = Self.defaults
        baseline = nil
        members = []
        saved = nil
        loaded = false
        busy = false
    }

    func load(id: UUID, session: SessionModel, member: VerifiedMember) async {
        guard !busy else { return }
        clear()
        let attempt = request
        busy = true
        notice = nil
        defer { if request == attempt { busy = false } }
        do {
            let context = try context(session, member)
            let pending = try await session.savedMealReminderRequest(context)
            try check(session, context, attempt)
            saved = pending
            let roster = try await session.renewalRoster(context)
            try check(session, context, attempt)
            members = roster.members
            try await refresh(id: id, session: session, context: context, attempt: attempt)
        } catch {
            guard request == attempt else { return }
            if session.status != .ready(member) { clear() }
            notice = "Could not load reminder choices. Connect and try again."
        }
    }

    func save(session: SessionModel, member: VerifiedMember) async {
        guard let baseline, canSave else { return }
        let command = SaveMealReminder(
            operationId: UUID(), entryId: baseline.meal.id,
            expectedItemRevision: baseline.itemRevision,
            expectedRevision: baseline.reminder?.revision,
            settings: settings.canonical())
        await perform(session: session, member: member) { context in
            try await session.stageMealReminder(command, baseline: baseline, context: context)
            try await session.retryMealReminder(context)
        }
    }
    func retry(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.retryMealReminder($0) }
    }
    func cancel(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.cancelMealReminder($0) }
    }
    func finish(id: UUID, session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.finishMealReminder($0) }
        if saved == nil { await load(id: id, session: session, member: member) }
    }

    private func context(_ session: SessionModel, _ member: VerifiedMember) throws -> RenewalContext {
        let context = try session.renewalContext()
        guard context.member == member else { throw NestAPIFailure.signedOut }
        return context
    }
    private func check(_ session: SessionModel, _ context: RenewalContext, _ attempt: UUID) throws {
        try session.requireRenewalAccount(context)
        guard request == attempt else { throw CancellationError() }
    }
    private func refresh(id: UUID, session: SessionModel, context: RenewalContext, attempt: UUID) async throws {
        let choices = try await session.readMealReminder(context, id: id)
        try check(session, context, attempt)
        baseline = choices
        settings = choices.reminder?.settings ?? Self.defaults
        loaded = true
    }
    private func perform(
        session: SessionModel, member: VerifiedMember,
        action: (RenewalContext) async throws -> Void
    ) async {
        guard !busy else { return }
        let attempt = request
        busy = true
        notice = nil
        defer { if request == attempt { busy = false } }
        do {
            let context = try context(session, member)
            do { try await action(context) } catch {
                try check(session, context, attempt)
                notice = "The change is not confirmed. Keep your choices or review the saved request before retrying."
            }
            let result = try await session.savedMealReminderRequest(context)
            try check(session, context, attempt)
            saved = result
            if result?.result?.status == .recorded, let id = baseline?.meal.id {
                do { try await refresh(id: id, session: session, context: context, attempt: attempt) } catch {
                    try check(session, context, attempt)
                    notice =
                        "Your save is confirmed, but current reminder choices could not reload. Connect and try again."
                }
            }
        } catch {
            guard request == attempt else { return }
            clear()
            notice = "Could not access reminder choices. Sign in and try again."
        }
    }
}
