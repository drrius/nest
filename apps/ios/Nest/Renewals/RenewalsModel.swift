import Foundation
import SwiftUI

@MainActor
final class RenewalsModel: ObservableObject {
    @Published private(set) var rows: [CalendarRenewal] = []
    @Published private(set) var members: [NestMember] = []
    @Published private(set) var next: UUID?
    @Published private(set) var saved: SavedRenewalCommand?
    @Published private(set) var busy = false
    @Published private(set) var loaded = false
    @Published private(set) var notice: String?

    func load(session: SessionModel, member: VerifiedMember, more: Bool = false) async {
        guard !busy else { return }
        busy = true
        notice = nil
        if !more {
            rows = []
            next = nil
            loaded = false
            saved = nil
        }
        defer { busy = false }
        do {
            let context = try context(session, member)
            saved = try await session.savedRenewalRequest(context)
            if !more { members = try await session.renewalRoster(context).members }
            let page = try await session.readRenewals(context, after: more ? next : nil)
            guard page.renewals.allSatisfy({ row in !rows.contains(where: { $0.id == row.id }) }) else {
                throw NestAPIFailure.contract
            }
            rows += page.renewals
            next = page.next
            loaded = true
        } catch {
            if session.status != .ready(member) { clear() }
            notice = "Could not load renewals. Connect and try again."
        }
    }

    func save(
        fields: CalendarRenewal.Fields, baseline: CalendarRenewal?, session: SessionModel,
        member: VerifiedMember
    ) async {
        let command = RenewalCommand(
            operationId: UUID(), renewalId: baseline?.id ?? UUID(),
            expectedRevision: baseline?.revision, fields: fields)
        await perform(session: session, member: member) { context in
            try await session.stageRenewalChange(command, baseline: baseline, context: context)
            try await session.retryRenewalChange(context)
        }
    }

    func remove(_ renewal: CalendarRenewal, session: SessionModel, member: VerifiedMember) async {
        let command = RenewalCommand(
            operationId: UUID(), renewalId: renewal.id,
            expectedRevision: renewal.revision, fields: nil)
        await perform(session: session, member: member) { context in
            try await session.stageRenewalChange(command, baseline: renewal, context: context)
            try await session.retryRenewalChange(context)
        }
    }

    func retry(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.retryRenewalChange($0) }
    }

    func cancel(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.cancelRenewalChange($0) }
    }

    func finish(session: SessionModel, member: VerifiedMember) async {
        await perform(session: session, member: member) { try await session.finishRenewalChange($0) }
        if saved == nil { await load(session: session, member: member) }
    }

    func clear() {
        rows = []
        members = []
        next = nil
        saved = nil
        loaded = false
    }

    private func context(_ session: SessionModel, _ member: VerifiedMember) throws -> RenewalContext {
        let context = try session.renewalContext()
        guard context.member == member else { throw NestAPIFailure.signedOut }
        return context
    }

    private func perform(
        session: SessionModel, member: VerifiedMember,
        action: (RenewalContext) async throws -> Void
    ) async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            do { try await action(context) } catch {
                try session.requireRenewalAccount(context)
                notice = "The change is not confirmed. Keep your draft or review the saved request before retrying."
            }
            saved = try await session.savedRenewalRequest(context)
            if saved?.result?.status == .recorded {
                rows = []
                next = nil
                loaded = false
                do {
                    let page = try await session.readRenewals(context, after: nil)
                    rows = page.renewals
                    next = page.next
                    loaded = true
                } catch {
                    try session.requireRenewalAccount(context)
                    notice = "Your change is confirmed, but the renewal list could not reload. Try again online."
                }
            }
        } catch {
            clear()
            notice = "Could not access renewals. Sign in and try again."
        }
    }
}
