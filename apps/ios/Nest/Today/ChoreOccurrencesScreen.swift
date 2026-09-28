import SwiftUI

struct ChoreOccurrencesScreen: View {
    @ObservedObject var model: SessionModel
    @State private var snapshot: ChoreSnapshot?
    @State private var hasSavedChange = false
    @State private var notice: String?
    @State private var working = false

    var body: some View {
        List {
            if hasSavedChange {
                NavigationLink("Review saved date or skip change") { ChoreChangeScreen(model: model, chore: nil) }
            }
            if let notice {
                Section {
                    Text(notice)
                    Button("Try again") { Task { await load() } }
                }
            }
            if let snapshot {
                if snapshot.chores.isEmpty {
                    ContentUnavailableView("No scheduled chores", systemImage: "checkmark.circle")
                }
                ForEach(snapshot.chores) { chore in
                    NavigationLink {
                        ChoreChangeScreen(model: model, chore: chore)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(chore.title).font(.headline).foregroundStyle(QuietPalette.ink)
                            Text("Due " + chore.dueDate.value).font(.subheadline).foregroundStyle(QuietPalette.muted)
                        }.padding(.vertical, 6)
                    }.listRowBackground(QuietPalette.surface)
                }
            } else if working {
                ProgressView("Loading chores…")
            }
        }
        .navigationTitle("Scheduled chores")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .refreshable { await load() }
        .task { await load() }
    }

    private func load() async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            let context = try model.routineCreateContext()
            hasSavedChange = try await model.savedChoreChange(context) != nil
            snapshot = try await model.readChangeableChores(context)
            notice = nil
        } catch { notice = "Could not refresh scheduled chores. Connect and try again." }
    }
}
