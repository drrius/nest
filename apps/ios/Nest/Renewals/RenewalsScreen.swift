import SwiftUI

struct RenewalsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model = RenewalsModel()
    @State private var adding = false
    @State private var editing: CalendarRenewal?
    @State private var reminding: CalendarRenewal?
    @State private var removing: CalendarRenewal?

    var body: some View {
        List {
            Section {
                Text(
                    "Keep track of renewal dates and when to give notice. Nest does not cancel contracts or create calendar events."
                )
                .foregroundStyle(QuietPalette.muted)
            }
            if let saved = model.saved {
                RenewalRequestSection(model: model, session: session, member: member, saved: saved)
            }
            if let notice = model.notice { Section { Text(notice) } }
            if model.busy { ProgressView("Checking renewals…") }
            Section("Household renewals") {
                ForEach(model.rows) { row in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(row.fields.title).font(.headline)
                        Text("Renews \(row.fields.renewalOn.value)")
                        Text("Cancel by \(row.cancellationOn.value)")
                            .foregroundStyle(QuietPalette.muted)
                        HStack {
                            Button {
                                editing = row
                            } label: {
                                Text("Edit").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                            }
                            Spacer()
                            Button(role: .destructive) {
                                removing = row
                            } label: {
                                Text("Remove").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                            }
                        }.buttonStyle(.borderless).disabled(model.busy || model.saved != nil)
                        Button {
                            reminding = row
                        } label: {
                            Text("Reminder choices").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                        }.buttonStyle(.borderless)
                    }.padding(.vertical, 6)
                }
                if model.loaded && model.rows.isEmpty { Text("No renewals yet.") }
                if model.next != nil {
                    Button("Load more") { Task { await model.load(session: session, member: member, more: true) } }
                        .disabled(model.busy)
                }
            }
            Button("Refresh") { Task { await model.load(session: session, member: member) } }.disabled(model.busy)
        }
        .navigationTitle("Renewals")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .toolbar {
            Button {
                adding = true
            } label: {
                Label("Add", systemImage: "plus")
                    .frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
            }.buttonStyle(.plain).disabled(model.busy || model.saved != nil)
        }
        .sheet(isPresented: $adding) {
            NavigationStack {
                RenewalEditorScreen(model: model, session: session, member: member, baseline: nil)
                    .id(session.generation)
            }
        }
        .sheet(item: $editing) { renewal in
            NavigationStack {
                RenewalEditorScreen(model: model, session: session, member: member, baseline: renewal)
                    .id(session.generation)
            }
        }
        .sheet(item: $reminding) { renewal in
            NavigationStack {
                RenewalReminderScreen(session: session, member: member, renewalId: renewal.id)
                    .id(session.generation)
            }
        }
        .alert(
            "Remove this renewal from Nest?",
            isPresented: Binding(
                get: { removing != nil }, set: { if !$0 { removing = nil } })
        ) {
            Button("Cancel", role: .cancel) { removing = nil }
            if let renewal = removing {
                Button("Remove renewal", role: .destructive) {
                    Task { await model.remove(renewal, session: session, member: member) }
                }
            }
        } message: {
            Text(
                "\(removing?.fields.title ?? "")\n\nThis does not cancel the contract, change a linked recurring expense or erase financial history."
            )
        }
        .task { await model.load(session: session, member: member) }
        .refreshable { await model.load(session: session, member: member) }
        .onChange(of: session.generation) { model.clear() }
    }
}
