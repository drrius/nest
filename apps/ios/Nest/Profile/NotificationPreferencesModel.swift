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

    func load(session: SessionModel, member: VerifiedMember) async {
        guard !busy else { return }
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
            if session.status != .ready(member) { clear() }
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
        if saved == nil { await load(session: session, member: member) }
    }

    func clear() {
        baseline = nil
        saved = nil
        preferences = NotificationPreferences(
            dailySummaryEnabled: false, dailySummaryTime: "08:00", itemRemindersEnabled: false)
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
