import SwiftUI

struct RenewalDetailScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let renewalId: UUID
    @State private var renewal: CalendarRenewal?
    @State private var notice: String?
    @State private var busy = false

    var body: some View {
        List {
            if let renewal {
                Section {
                    Text(renewal.fields.title).font(.headline)
                    Text("Renews \(renewal.fields.renewalOn.value)")
                    Text("Cancel by \(renewal.cancellationOn.value)")
                    Text("\(renewal.fields.noticeDays) \(renewal.fields.noticeDays == 1 ? "day’s" : "days’") notice")
                    if renewal.removed { Text("Removed from Nest. This record is retained as history.") }
                    if !renewal.removed {
                        NavigationLink("Reminder choices") {
                            RenewalReminderScreen(session: session, member: member, renewalId: renewal.id)
                                .id(session.generation)
                        }
                    }
                    if let id = renewal.fields.recurringRuleId {
                        NavigationLink("View linked recurring expense") {
                            RecurringRuleScreen(session: session, member: member, ruleId: id).id(session.generation)
                        }
                    }
                    Text("These dates do not confirm cancellation or change financial obligations.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
            }
            if let notice { Text(notice) }
            if busy { ProgressView("Loading renewal…") }
            Button("Refresh") { Task { await load() } }.disabled(busy)
            NavigationLink("Manage renewals") {
                RenewalsScreen(session: session, member: member).id(session.generation)
            }
        }
        .navigationTitle("Renewal")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .refreshable { await load() }
        .onChange(of: session.generation) { renewal = nil }
    }

    private func load() async {
        guard !busy else { return }
        busy = true
        notice = nil
        defer { busy = false }
        do {
            let context = try session.renewalContext()
            guard context.member == member else { throw NestAPIFailure.signedOut }
            let read = try await session.loadRenewal(context, id: renewalId)
            try session.requireRenewalAccount(context)
            renewal = read.value
            notice = read.notice
        } catch {
            if (error as? NestAPIFailure) != .unavailable || session.status != .ready(member) { renewal = nil }
            notice =
                renewal == nil
                ? "Could not load this renewal. Connect and try again."
                : "Showing previously loaded renewal information. Connect and refresh for updates."
        }
    }
}
