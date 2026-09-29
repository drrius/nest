import Foundation
import SwiftUI

@MainActor
final class GroceryReminderModel: ObservableObject {
    @Published var settings = GroceryReminderModel.defaults
    @Published private(set) var baseline: GroceryReminderContext?
    @Published private(set) var members: [NestMember] = []
    @Published private(set) var saved: SavedGroceryReminderRequest?
    @Published private(set) var loaded = false
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var request = UUID()
    private var initial = GroceryReminderModel.defaults
    static var defaults: DatedReminderSettings {
        .init(enabled: false, recipientIds: [], localDate: ReminderDay.day(.now)!, localTime: "08:00")
    }
    var dirty: Bool { loaded && saved == nil && settings != initial }
    var canSave: Bool {
        loaded && !busy && saved == nil && baseline?.grocery.checked == false
            && (try? settings.validated(members: members.map(\.actorId))) != nil
    }

    func clear() {
        request = UUID()
        settings = Self.defaults
        initial = settings
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
            let pending = try await session.savedGroceryReminderRequest(context)
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
        let command = SaveGroceryReminder(
            operationId: UUID(), itemId: baseline.grocery.id,
            expectedItemVersion: baseline.itemVersion,
            expectedRevision: baseline.reminder?.revision,
            settings: settings.canonical())
        await perform(session: session, member: member) { context in
            try await session.stageGroceryReminder(command, baseline: baseline, context: context)
            try await session.retryGroceryReminder(context)
        }
    }
    func retry(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.retryGroceryReminder($0) }
    }
    func cancel(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.cancelGroceryReminder($0) }
    }
    func finish(id: UUID, session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.finishGroceryReminder($0) }
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
        let choices = try await session.readGroceryReminder(context, id: id)
        try check(session, context, attempt)
        baseline = choices
        settings = choices.reminder?.settings ?? Self.defaults
        initial = settings
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
            let result = try await session.savedGroceryReminderRequest(context)
            try check(session, context, attempt)
            saved = result
            if result?.result?.status == .recorded, let id = baseline?.grocery.id {
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
