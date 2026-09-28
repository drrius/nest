import EventKit
import SwiftUI

struct CalendarScreen: View {
    @ObservedObject var session: SessionModel
    @StateObject private var model: CalendarModel
    @State private var day = Date()
    @State private var picking = false
    @State private var showChores = false
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    init(member: VerifiedMember, session: SessionModel) {
        self.session = session
        _model = StateObject(wrappedValue: CalendarModel(selectionStore: CalendarSelectionStore(member: member)))
    }

    var body: some View {
        List {
            Section {
                NavigationLink("Busy sharing") { CalendarSharingScreen(session: session).id(session.generation) }
            }
            if let notice = model.notice { Section { Text(notice) } }
            if model.access == .allowed {
                Section {
                    DatePicker("Day", selection: $day, displayedComponents: .date)
                    Text("Your calendar details stay on this device. Manage events in Apple Calendar.")
                        .font(.subheadline).foregroundStyle(QuietPalette.muted)
                }
                agenda
            } else {
                permission
            }
            PartnerBusySection(session: session, day: day)
            Section { Toggle("Show household chores", isOn: $showChores) }
            if showChores { CalendarChoreSection(session: session, day: day) }
        }
        .scrollContentBackground(.hidden)
        .background(QuietPalette.background)
        .navigationTitle("Calendar")
        .toolbar {
            if model.access == .allowed {
                Button("Calendars", systemImage: "line.3.horizontal.decrease") { picking = true }
            }
        }
        .sheet(isPresented: $picking) { calendarPicker }
        .task { model.refresh(day: day) }
        .onChange(of: day) { model.refresh(day: day) }
        .onChange(of: scenePhase) {
            if scenePhase == .active { model.refresh(day: day) } else { model.clearVisibleDetails() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            if scenePhase == .active { model.refresh(day: day) }
        }
        .refreshable { model.refresh(day: day) }
    }

    private var agenda: some View {
        Section("On your calendar") {
            if model.calendars.isEmpty {
                Text("No calendars are available on this device. Check your calendar accounts in Settings.")
            } else if model.selected.isEmpty {
                Text("Choose the calendars you want to see here. This does not share them with anyone.")
                Button("Choose calendars") { picking = true }
            } else if model.events.isEmpty {
                Text("No events in your selected calendars for this day.")
                Text("This does not confirm that you or your partner are free.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            } else {
                ForEach(model.events) { event in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(event.title).font(.headline)
                        if event.allDay {
                            Text("All day").font(.subheadline)
                        } else {
                            Text(
                                "\(event.start.formatted(date: .abbreviated, time: .shortened)) – \(event.end.formatted(date: .abbreviated, time: .shortened))"
                            )
                            .font(.subheadline)
                        }
                        Text(event.calendar).font(.caption).foregroundStyle(QuietPalette.muted)
                        if let location = event.location, !location.isEmpty {
                            Text(location).font(.subheadline).foregroundStyle(QuietPalette.muted)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
    }

    private var permission: some View {
        Section("Your day, in one place") {
            Text("Nest reads the calendars you choose. It does not create, change or delete events.")
            switch model.access {
            case .notRequested:
                Text("iOS calls this Full Access. Nest uses it only to read your calendars.")
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
                Button(model.requesting ? "Requesting access…" : "Allow calendar access") {
                    Task { await model.requestAccess(day: day) }
                }.disabled(model.requesting)
            case .denied:
                Text("Calendar access is off. You can enable it in Settings; other Nest features still work.")
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
            case .restricted:
                Text("This device restricts calendar access. A work or device policy may prevent it.")
            case .allowed:
                EmptyView()
            }
        }
    }

    private var calendarPicker: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(model.calendars) { calendar in
                        Toggle(
                            isOn: Binding(
                                get: { model.selected.contains(calendar.id) },
                                set: { model.select(calendar.id, enabled: $0, day: day) }
                            )
                        ) {
                            VStack(alignment: .leading) {
                                Text(calendar.title)
                                Text(calendar.source).font(.caption).foregroundStyle(QuietPalette.muted)
                            }
                        }
                    }
                } footer: {
                    Text("Only changes what you see on this device. Busy sharing is not enabled.")
                }
            }
            .navigationTitle("Your calendars")
            .toolbar { Button("Done") { picking = false } }
        }
    }
}
