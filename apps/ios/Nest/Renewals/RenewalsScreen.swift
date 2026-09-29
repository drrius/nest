import SwiftUI

struct RenewalsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model = RenewalsModel()
    @State private var adding = false
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
                            NavigationLink("Edit") {
                                RenewalEditorScreen(model: model, session: session, member: member, baseline: row)
                                    .id(session.generation)
                            }
                            Spacer()
                            Button("Remove", role: .destructive) { removing = row }
                        }.disabled(model.busy || model.saved != nil)
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
        .toolbar { Button("Add", systemImage: "plus") { adding = true }.disabled(model.busy || model.saved != nil) }
        .sheet(isPresented: $adding) {
            NavigationStack {
                RenewalEditorScreen(model: model, session: session, member: member, baseline: nil)
                    .id(session.generation)
            }
        }
        .confirmationDialog(
            "Remove this renewal from Nest?",
            isPresented: Binding(
                get: { removing != nil }, set: { if !$0 { removing = nil } }), titleVisibility: .visible
        ) {
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
