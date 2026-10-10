import Foundation
import SwiftUI

@MainActor
final class RenewalChoicesModel: ObservableObject {
    @Published private(set) var members: [NestMember] = []
    @Published private(set) var rules: [RecurringRule] = []
    @Published private(set) var next: UUID?
    @Published private(set) var loaded = false
    @Published private(set) var busy = false
    @Published private(set) var notice: String?

    func load(session: SessionModel, member: VerifiedMember, more: Bool = false) async {
        guard !busy else { return }
        busy = true
        notice = nil
        if !more {
            members = []
            rules = []
            next = nil
            loaded = false
        }
        defer { busy = false }
        do {
            let context = try session.renewalContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            if !more { members = try await session.renewalRoster(context).members }
            let page = try await session.renewalExpenseChoices(context, after: more ? next : nil)
            guard page.rules.allSatisfy({ row in !rules.contains(where: { $0.id == row.id }) }) else {
                throw NestAPIFailure.contract
            }
            rules += page.rules
            next = page.next
            loaded = true
        } catch {
            if session.status != .ready(member) {
                members = []
                rules = []
                next = nil
                loaded = false
            }
            notice = "Could not load household choices. Connect and try again."
        }
    }
}
