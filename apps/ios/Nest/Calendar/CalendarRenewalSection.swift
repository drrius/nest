import SwiftUI

struct CalendarRenewalSection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @State private var rows: [CalendarRenewal] = []
    @State private var next: UUID?
    @State private var notice: String?
    @State private var request = UUID()
    @State private var loading = false

    var body: some View {
        QuietSectionCard(title: "Household renewals") {
            ForEach(rows) { row in
                VStack(alignment: .leading, spacing: 4) {
                    Text(row.fields.title).font(.headline)
                    Text(label(row)).font(.subheadline).foregroundStyle(QuietPalette.muted)
                }.padding(.vertical, 4)
            }
            if loading { ProgressView("Loading renewals…") }
            if let notice { Text(notice) }
            if !loading && notice == nil && rows.isEmpty { Text("No renewals or cancellation deadlines on this day.") }
            if next != nil { Button("Load more") { Task { await load(more: true) } }.disabled(loading) }
            Button("Refresh renewals") { Task { await load(more: false) } }.disabled(loading)
            if case .ready(let member) = session.status {
                NavigationLink("Manage renewals") {
                    RenewalsScreen(session: session, member: member).id(session.generation)
                }
            }
            Text("Dates shown in Nest only. No calendar events or financial entries are created.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
        .task(id: day) { await load(more: false) }
    }

    private func civilDay() throws -> CivilDate {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return try CivilDate(formatter.string(from: day))
    }

    private func label(_ row: CalendarRenewal) -> String {
        let selected = try? civilDay()
        if row.fields.renewalOn == selected && row.cancellationOn == selected {
            return "Renewal date · cancellation deadline"
        }
        return row.cancellationOn == selected ? "Cancellation deadline" : "Renewal date"
    }

    private func load(more: Bool) async {
        let attempt = UUID()
        request = attempt
        let cursor = more ? next : nil
        if !more {
            rows = []
            next = nil
        }
        loading = true
        notice = nil
        defer { if request == attempt { loading = false } }
        do {
            let date = try civilDay()
            let context = try await session.calendarConsentContext()
            let result = try await session.readCalendarRenewals(context, day: date, after: cursor)
            try Task.checkCancellation()
            guard request == attempt else { return }
            rows.append(contentsOf: result.renewals)
            next = result.next
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load renewals. Try again online."
        }
    }
}
