import Foundation
import SwiftUI

@MainActor
final class NotificationPreferencesModel: ObservableObject {
    @Published var preferences = NotificationPreferences(
        dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: false)
    @Published private(set) var baseline: NotificationProfileEnvelope?
    @Published private(set) var saved: SavedNotificationPreference?
    @Published private(set) var busy = false
    @Published private(set) var notice: String?
    private var generation: Int?

    var hasUnsavedChanges: Bool {
        saved == nil && baseline != nil
            && preferences != (baseline?.profile?.preferences ?? Self.defaults)
    }

    private static let defaults = NotificationPreferences(
        dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: false)

    func load(session: SessionModel, member: VerifiedMember, discardDraft: Bool = false) async {
        guard prepareLoad(session: session, member: member, discardDraft: discardDraft) else { return }
        busy = true
        baseline = nil
        saved = nil
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            saved = try await session.savedNotificationRequest(context)
            if let saved { preferences = saved.command.preferences }
            let current = try await session.readNotificationPreferences(context)
            baseline = current
            if saved == nil {
                preferences =
                    current.profile?.preferences
                    ?? NotificationPreferences(
                        dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: false)
            }
        } catch {
            if session.status != .ready(member) || generation != session.generation { clear() }
            notice = "Could not load notification choices. Connect and try again."
        }
    }

    func save(session: SessionModel, member: VerifiedMember) async {
        guard let baseline, saved == nil else { return }
        let draft = preferences
        await perform(session: session, member: member) { context in
            try await session.stageNotificationPreferences(draft, baseline: baseline, context: context)
            try await session.retryNotificationPreferences(context)
        }
    }

    func retry(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.retryNotificationPreferences($0) }
    }

    func finish(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.finishNotificationRequest($0) }
        if saved == nil { await load(session: session, member: member, discardDraft: true) }
    }

    func clear() {
        generation = nil
        baseline = nil
        saved = nil
        preferences = Self.defaults
    }

    private func prepareLoad(session: SessionModel, member: VerifiedMember, discardDraft: Bool) -> Bool {
        guard !busy else { return false }
        guard session.status == .ready(member) else {
            clear()
            notice = "Sign in to access your notification choices."
            return false
        }
        if generation != session.generation { clear() }
        if hasUnsavedChanges && !discardDraft { return false }
        generation = session.generation
        return true
    }

    private func context(_ session: SessionModel, _ member: VerifiedMember) throws -> NotificationContext {
        let value = try session.notificationContext()
        guard value.member == member else { throw NestAPIFailure.signedOut }
        return value
    }

    private func perform(
        session: SessionModel, member: VerifiedMember, action: (NotificationContext) async throws -> Void
    ) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            do { try await action(context) } catch {
                try session.requireNotificationAccount(context)
                notice = "The change is not confirmed. Review any saved request, or reload before saving again."
            }
            saved = try await session.savedNotificationRequest(context)
        } catch {
            clear()
            notice = "Could not access your notification choices. Sign in and try again."
        }
    }
}
