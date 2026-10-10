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
    private var account: VerifiedMember?
    private var collectionId: UUID?

    func load(session: SessionModel, member: VerifiedMember, more: Bool = false) async {
        guard !busy, !more || next != nil else { return }
        if account != nil && account != member { clear() }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            let context = try context(session, member)
            saved = try await session.savedRenewalRequest(context)
            let read = try await session.loadRenewals(
                context, after: more ? next : nil, collection: more ? collectionId : nil)
            let page = read.value
            if more && !page.renewals.allSatisfy({ row in !rows.contains(where: { $0.id == row.id }) }) {
                throw NestAPIFailure.contract
            }
            if !more { members = try await session.renewalDisplayMembers(context) }
            try session.requireRenewalAccount(context)
            rows = more ? rows + page.renewals : page.renewals
            next = page.next
            collectionId = read.collectionId
            account = member
            loaded = true
            notice = read.notice
        } catch { failedLoad(error, session: session, member: member) }
    }

    private func failedLoad(_ error: Error, session: SessionModel, member: VerifiedMember) {
        let unavailable = (error as? NestAPIFailure) == .unavailable || error is URLError
        if !unavailable || session.status != .ready(member) { clear() }
        notice =
            loaded
            ? "Showing previously loaded renewals. Connect and refresh for updates."
            : "Could not load renewals. Connect and try again."
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
        account = nil
        collectionId = nil
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
                    let read = try await session.loadRenewals(context, after: nil)
                    rows = read.value.renewals
                    next = read.value.next
                    collectionId = read.collectionId
                    account = member
                    loaded = true
                    if let stale = read.notice { notice = stale }
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
