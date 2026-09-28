import SwiftUI

struct CalendarSharingScreen: View {
    @ObservedObject var session: SessionModel
    @State private var context: CalendarConsentContext?
    @State private var consent: CalendarConsent?
    @State private var calendars: [DeviceCalendar] = []
    @State private var selected: Set<String> = []
    @State private var working = false
    @State private var notice: String?
    @State private var confirmEnable = false
    private let reader = EventKitCalendarReader()

    var body: some View {
        List {
            Section {
                Text(
                    "Share busy times with your partner and Nest’s meal planning. Event names, locations and calendar names stay on this device."
                )
                Text("Leave shared iCloud calendars out to avoid counting the same events twice.")
                    .font(.subheadline).foregroundStyle(QuietPalette.muted)
            }
            if let notice { Section { Text(notice) } }
            if let pending = context?.pending {
                recovery(pending)
            } else if let consent {
                Section("Sharing") {
                    Text(consent.enabled ? "Busy sharing is enabled" : "Busy sharing is off")
                    if consent.enabled {
                        Button("Turn off and remove shared busy times", role: .destructive) {
                            Task { await changeConsent(false) }
                        }
                    } else {
                        Button("Enable busy sharing") { confirmEnable = true }
                    }
                }
                if consent.enabled { selection }
            }
            Section { Button("Refresh sharing status") { Task { await load() } } }
        }
        .disabled(working)
        .overlay { if working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Busy sharing")
        .task { await load() }
        .confirmationDialog("Share busy times with your household and AI?", isPresented: $confirmEnable) {
            Button("Enable sharing") { Task { await changeConsent(true) } }
        } message: {
            Text(
                "Only calendars you explicitly choose here will be included when you publish. Calendar details stay private."
            )
        }
    }

    private var selection: some View {
        Section {
            if calendars.isEmpty {
                Text("Allow calendar access and make calendars available on this device before publishing.")
            }
            ForEach(calendars) { calendar in
                Toggle(
                    calendar.title,
                    isOn: Binding(
                        get: { selected.contains(calendar.id) },
                        set: { if $0 { selected.insert(calendar.id) } else { selected.remove(calendar.id) } }
                    ))
            }
            Button("Publish selected busy times") { Task { await publish() } }
                .disabled(selected.isEmpty)
        } header: {
            Text("Calendars to share")
        } footer: {
            Text(
                "Choices here are separate from your agenda. Publish replaces your previous snapshot. Removing a choice alone does not remove published times: publish again or turn sharing off. Snapshots expire after 15 minutes; refresh here to update them."
            )
        }
    }

    private func recovery(_ pending: SavedCalendarConsent) -> some View {
        Section("Saved sharing change") {
            Text(
                pending.conflict
                    ? "The sharing settings changed. Review their current state before trying again."
                    : "Your change is saved, but its result is not confirmed.")
            Button(pending.conflict ? "Clear rejected change" : "Retry saved change") {
                Task { await recover() }
            }
        }
    }

    private func load() async {
        working = true
        defer { working = false }
        do {
            let value = try await session.calendarConsentContext()
            context = value
            consent = try await session.readCalendarConsent(value)
            calendars = reader.calendars()
            selected.formIntersection(calendars.map(\.id))
        } catch {
            consent = nil
            notice = "Could not load sharing status. Try again online."
        }
    }

    private func changeConsent(_ enabled: Bool) async {
        guard let context, let consent else { return }
        working = true
        defer { working = false }
        do {
            try await session.stageCalendarConsent(consent, enabled: enabled, context: context)
            self.context = try await session.calendarConsentContext()
            self.consent = try await session.retryCalendarConsent(context)
            self.context = try await session.calendarConsentContext()
            notice =
                enabled
                ? "Sharing enabled. Choose calendars and publish their busy times."
                : "Sharing is off. Shared busy times have been removed."
        } catch {
            await reloadPending()
            notice = "The change is not confirmed. Check the saved change before continuing."
        }
    }

    private func recover() async {
        guard let context else { return }
        working = true
        defer { working = false }
        do {
            if context.pending?.conflict == true {
                try await session.discardRejectedCalendarConsent(context)
            } else {
                _ = try await session.retryCalendarConsent(context)
            }
            await load()
            notice = nil
        } catch {
            await reloadPending()
            notice = "Could not confirm the saved change. Try again online."
        }
    }

    private func publish() async {
        guard let context, let consent else { return }
        working = true
        defer { working = false }
        do {
            let capture = try await session.beginCalendarCapture(context, consent: consent)
            let start = Calendar.current.startOfDay(for: .now)
            guard let end = Calendar.current.date(byAdding: .day, value: 28, to: start),
                let covered = EventKitBusyMapping.interval(start: start, end: end),
                case .known(let projection) = reader.captureBusy(selected: selected, covered: covered)
            else { throw NestAPIFailure.unavailable }
            let receipt = try await session.publishCalendarCapture(context, capture: capture, projection: projection)
            let expiry = try BusyCapture.timestamp(receipt.expiresAt)
            notice = "Busy times published until \(expiry.formatted(date: .omitted, time: .shortened))."
        } catch {
            notice =
                "Publishing is not confirmed. Previous busy times may remain until they expire. Retry or turn sharing off."
        }
    }

    private func reloadPending() async {
        context = try? await session.calendarConsentContext()
    }
}
