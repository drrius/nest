import SwiftUI

struct LegacyRecurringScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: LegacyRecurringModel

    init(session: SessionModel, member: VerifiedMember) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: LegacyRecurringModel(session: session, member: member))
    }

    var body: some View {
        List {
            Section {
                Text(
                    "Kept from your previous app. These rules only created drafts; Nest will not add expenses from them automatically."
                )
                .foregroundStyle(QuietPalette.muted)
            }
            ForEach(model.rules) { rule in
                NavigationLink {
                    LegacyDraftsScreen(session: session, member: member, rule: rule).id(session.generation)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(LegacyRecurringLabel.display(rule.description)).font(.headline)
                        Text(rule.amountCentimes.absoluteCHF).monospacedDigit()
                        Text(
                            "\(rule.drafts.pending) pending · \(rule.drafts.posted) posted · \(rule.drafts.dismissed) dismissed"
                        )
                        .font(.subheadline).foregroundStyle(QuietPalette.muted)
                        if rule.drafts.needsReconciliation {
                            Text("Some retained records need review.").font(.footnote)
                        }
                    }.padding(.vertical, 4)
                }
            }
            if model.loaded && model.rules.isEmpty { Text("No retained recurring expenses.") }
            if let notice = model.notice { Text(notice) }
            if model.working { ProgressView("Loading retained rules…") }
            if model.next != nil {
                Button("Load more") { Task { await model.load(more: true) } }.disabled(model.working)
            }
            Button("Refresh") { Task { await model.load() } }.disabled(model.working)
        }
        .navigationTitle("Retained recurring")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task(id: session.generation) { await model.load() }
        .refreshable { await model.load() }
    }
}
