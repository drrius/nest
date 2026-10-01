import SwiftUI

struct AssistantGroceryDestination: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let result: AssistantGroceryActionLink
    @StateObject private var detail = AssistantGroceryModel()

    var body: some View {
        List {
            if session.status == .ready(member) { content }
        }
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .navigationTitle("Current grocery").navigationBarTitleDisplayMode(.inline)
        .task { await detail.load(session: session, member: member, result: result) }
        .refreshable { await detail.load(session: session, member: member, result: result) }
        .onDisappear { detail.clear() }
    }

    @ViewBuilder
    private var content: some View {
        switch detail.status {
        case .idle, .loading:
            ProgressView("Loading current grocery…")
        case .failed:
            Section {
                Text("Could not load this grocery's current state. Try again online.")
                    .foregroundStyle(QuietPalette.muted)
                Button("Try again") { Task { await detail.load(session: session, member: member, result: result) } }
                    .frame(minHeight: 44)
            }
        case .loaded(let item):
            Section {
                if let item {
                    Text(item.name).font(.headline).foregroundStyle(QuietPalette.ink)
                    let amount = [item.quantity, item.unit].compactMap { $0 }.joined(separator: " ")
                    if !amount.isEmpty { Text(amount).foregroundStyle(QuietPalette.muted) }
                    if let category = item.categoryName { Text(category).foregroundStyle(QuietPalette.muted) }
                    Label(
                        item.checked ? "Picked up" : "Still to pick up",
                        systemImage: item.checked ? "checkmark.circle" : "circle")
                        .foregroundStyle(QuietPalette.accent)
                } else {
                    Text("This grocery is no longer in the shared list.").foregroundStyle(QuietPalette.muted)
                }
            }.listRowBackground(QuietPalette.surface)
            NavigationLink {
                GroceriesScreen(model: session, refreshOnOpen: true).id(session.generation)
            } label: {
                Text("Open groceries").frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(Rectangle())
            }
        }
    }
}
