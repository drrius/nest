import SwiftUI

struct CalendarChoreSection: View {
    @ObservedObject var session: SessionModel
    let day: Date
    @State private var rows: [CalendarChore] = []
    @State private var notice: String?
    @State private var request = UUID()
    @State private var loading = false

    var body: some View {
        Section("Household chores") {
            if loading {
                ProgressView("Loading chores…")
            } else if let notice {
                Text(notice)
            } else if rows.isEmpty {
                Text("No chores due on this day.")
            } else {
                ForEach(rows) { row in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(row.title).font(.headline)
                        Text(row.role == .preview ? "Upcoming · may change" : "Current occurrence")
                            .font(.caption).foregroundStyle(QuietPalette.muted)
                    }.padding(.vertical, 4)
                }
            }
            Button("Refresh chores") { Task { await load() } }
            Text("Shown in Nest only. Manage and complete chores from Today.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
        .task(id: day) { await load() }
    }

    private func load() async {
        let attempt = UUID()
        request = attempt
        loading = true
        rows = []
        defer { if request == attempt { loading = false } }
        do {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            let date = try CivilDate(formatter.string(from: day))
            let context = try await session.calendarConsentContext()
            let result = try await session.readCalendarChores(context, day: date)
            try Task.checkCancellation()
            guard request == attempt else { return }
            rows = result.chores
            notice = nil
        } catch {
            guard request == attempt, !Task.isCancelled else { return }
            notice = "Could not load chores. Try again online."
        }
    }
}
