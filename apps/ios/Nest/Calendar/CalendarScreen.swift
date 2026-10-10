import EventKit
import SwiftUI

struct CalendarScreen: View {
    @ObservedObject var session: SessionModel
    @StateObject private var model: CalendarModel
    @State private var day = Date()
    @State private var picking = false
    @State private var showChores: Bool
    @State private var showRenewals: Bool
    private let layerStore: CalendarSelectionStore
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL

    private var readyMember: VerifiedMember? {
        if case .ready(let member) = session.status { return member }
        return nil
    }

    init(member: VerifiedMember, session: SessionModel) {
        self.session = session
        let layers = CalendarSelectionStore(member: member, purpose: .layers)
        layerStore = layers
        _showChores = State(initialValue: layers.read().contains("chores"))
        _showRenewals = State(initialValue: layers.read().contains("renewals"))
        _model = StateObject(wrappedValue: CalendarModel(selectionStore: CalendarSelectionStore(member: member)))
    }

    @State private var showingLayers = false
    @Environment(\.memberPalette) private var palette

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                content
            }
            .padding(.horizontal, 20)
            .padding(.top, 6)
            .padding(.bottom, 32)
        }
        .nestRootChrome("Calendar", session: session, member: readyMember) {
            Button {
                showingLayers = true
            } label: {
                Image(systemName: "square.3.layers.3d")
            }
            .accessibilityLabel("Calendars and layers")
        }
        .sheet(isPresented: $picking) { calendarPicker }
        .sheet(isPresented: $showingLayers) { layersSheet }
        .task { model.refresh(day: day) }
        .onChange(of: day) { model.refresh(day: day) }
        .onChange(of: showChores) { saveLayers() }
        .onChange(of: showRenewals) { saveLayers() }
        .onChange(of: scenePhase) {
            if scenePhase == .active { model.refresh(day: day) } else { model.clearVisibleDetails() }
        }
        .onReceive(NotificationCenter.default.publisher(for: .EKEventStoreChanged)) { _ in
            if scenePhase == .active { model.refresh(day: day) }
        }
        .refreshable { model.refresh(day: day) }
    }

    @ViewBuilder
    private var content: some View {
        CalendarWeekStrip(day: $day)
        if let notice = model.notice {
            Label(notice, systemImage: "info.circle").font(.footnote).foregroundStyle(NestColor.ink2)
        }
        if model.access == .allowed {
            agenda
        } else {
            permission
        }
        PartnerBusySection(session: session, day: day)
        if showChores { CalendarChoreSection(session: session, day: day) }
        if showRenewals { CalendarRenewalSection(session: session, day: day) }
    }

    private var layersSheet: some View {
        NavigationStack {
            List {
                Section {
                    Button("Choose calendars") {
                        showingLayers = false
                        picking = true
                    }
                    .disabled(model.access != .allowed)
                } footer: {
                    Text("Your event details stay on this iPhone. Manage events in Apple Calendar.")
                }
                Section("Household layers") {
                    Toggle("Show household chores", isOn: $showChores)
                    Toggle("Show household renewals", isOn: $showRenewals)
                }
                Section {
                    NavigationLink("Busy sharing") { CalendarSharingScreen(session: session).id(session.generation) }
                } footer: {
                    Text(
                        "\(palette.partnerName.capitalizedFirst) only ever sees when you’re busy, never what or where.")
                }
            }
            .navigationTitle("Calendars and layers")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                QuietToolbarButton("Done", systemImage: "checkmark") { showingLayers = false }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func saveLayers() {
        var layers: Set<String> = []
        if showChores { layers.insert("chores") }
        if showRenewals { layers.insert("renewals") }
        layerStore.save(layers)
    }

    private var agenda: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                NestSectionHeader(title: dayTitle)
                if Calendar.current.isDateInToday(day) { NestPill(text: "Today", tone: .accent) }
            }
            VStack(alignment: .leading, spacing: 0) {
                if model.calendars.isEmpty {
                    agendaNote("No calendars on this iPhone. Add an account in Settings.", icon: "calendar")
                } else if model.selected.isEmpty {
                    Button {
                        picking = true
                    } label: {
                        agendaNote("Choose which calendars to show here. Nothing is shared.", icon: "checklist")
                    }
                    .buttonStyle(NestPressStyle())
                } else if model.events.isEmpty {
                    agendaNote("Nothing in your calendars for this day.", icon: "sun.max")
                } else {
                    ForEach(Array(model.events.enumerated()), id: \.element.id) { index, event in
                        if index > 0 { NestRowDivider(leading: 86) }
                        eventRow(event)
                    }
                }
            }
            .nestCard(padding: 0)
        }
    }

    private var dayTitle: String {
        day.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    private func agendaNote(_ text: String, icon: String) -> some View {
        Label(text, systemImage: icon).font(.subheadline).foregroundStyle(NestColor.ink2)
            .frame(maxWidth: .infinity, alignment: .leading).padding(16)
    }

    private func eventRow(_ event: DeviceCalendarEvent) -> some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 1) {
                Text(event.allDay ? "All day" : event.start.formatted(date: .omitted, time: .shortened))
                    .font(.system(.subheadline, design: .rounded, weight: .semibold))
                if !event.allDay {
                    Text(event.end.formatted(date: .omitted, time: .shortened))
                        .font(.system(.caption, design: .rounded)).foregroundStyle(NestColor.ink3)
                }
            }
            .monospacedDigit()
            .frame(width: 58, alignment: .leading)
            RoundedRectangle(cornerRadius: 2).fill(palette.color(palette.me).color).frame(width: 4)
            VStack(alignment: .leading, spacing: 2) {
                Text(event.title).font(.body.weight(.medium)).foregroundStyle(NestColor.ink)
                Text(
                    [event.calendar, event.location].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
                )
                .font(.footnote).foregroundStyle(NestColor.ink2)
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .accessibilityElement(children: .combine)
    }

    private var permission: some View {
        VStack(alignment: .leading, spacing: 16) {
            NestArt(width: 150).frame(maxWidth: .infinity)
            Text("See your day next to \(palette.partnerName)’s").font(.title2.weight(.bold)).foregroundStyle(
                NestColor.ink)
            VStack(alignment: .leading, spacing: 14) {
                bullet(
                    "lock", .house, "Your details stay on this iPhone",
                    "Event names, places and notes are never uploaded.")
                bullet(
                    "person.2", .groceries, "Busy times only, if you choose", "Sharing is a separate, optional step.")
                bullet(
                    "calendar.badge.checkmark", .calendar, "Nest never changes your calendar",
                    "It only reads the calendars you pick.")
            }
            switch model.access {
            case .notRequested:
                Button(model.requesting ? "Asking…" : "Connect Apple Calendar") {
                    Task { await model.requestAccess(day: day) }
                }
                .buttonStyle(NestButtonStyle(kind: .primary, fullWidth: true))
                .disabled(model.requesting)
                .accessibilityLabel("Allow calendar access")
                Text("iOS calls this Full Access. Nest uses it only to read.").font(.footnote).foregroundStyle(
                    NestColor.ink3)
            case .denied:
                Text("Calendar access is off. Meals, chores and money work without it.").foregroundStyle(NestColor.ink2)
                Button("Open Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                }
                .buttonStyle(NestButtonStyle(kind: .secondary, fullWidth: true))
            case .restricted:
                Text("This iPhone restricts calendar access, perhaps by a work policy.").foregroundStyle(NestColor.ink2)
            case .allowed:
                EmptyView()
            }
        }
        .nestCard(padding: 22)
    }

    private func bullet(_ icon: String, _ domain: NestDomain, _ title: String, _ detail: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            IconTile(systemName: icon, domain: domain, size: 32)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(NestColor.ink)
                Text(detail).font(.footnote).foregroundStyle(NestColor.ink2)
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
                                Text(calendar.source).font(.caption).foregroundStyle(NestColor.ink2)
                            }
                        }
                    }
                } footer: {
                    Text("Only changes what you see on this device. Busy sharing is not enabled.")
                }
            }
            .navigationTitle("Your calendars")
            .toolbar {
                QuietToolbarButton("Done", systemImage: "checkmark") { picking = false }
            }
        }
    }
}
