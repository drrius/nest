import SwiftUI

struct ManualCycleScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @StateObject private var model: ManualCycleModel
    @State private var confirmCancel = false

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID) {
        self.session = session
        self.member = member
        _model = StateObject(wrappedValue: ManualCycleModel(session: session, member: member, ruleId: ruleId))
    }

    var body: some View {
        Form {
            if let saved = model.saved {
                recovery(saved)
            } else if let review = model.review, let cycle = review.target.manualCycle {
                ManualCycleSummary(
                    member: member, input: review.input, configuration: review.target.rule.configuration,
                    cycle: cycle, source: review.source)
                Section {
                    Button("Use this expense for this cycle") { Task { await model.confirm() } }
                    Button("Choose another expense") { model.edit() }
                    Button("Reload bill and expenses") { Task { await model.load() } }
                }
            } else {
                selection
            }
            if let notice = model.notice { Section { Text(notice) } }
        }
        .disabled(model.working)
        .navigationTitle("Link existing expense")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .overlay { if model.working { ProgressView().padding().background(.regularMaterial, in: Capsule()) } }
        .task(id: session.generation) { await model.load() }
        .confirmationDialog("Cancel this pending link?", isPresented: $confirmCancel) {
            Button("Cancel pending link", role: .destructive) { Task { await model.retry(cancel: true) } }
        } message: {
            Text("If the expense was already linked, Nest will recover that result and keep the cycle covered.")
        }
    }

    private var selection: some View {
        Section {
            if let target = model.target {
                Text(target.rule.configuration.description).font(.headline)
                if let cycle = target.manualCycle {
                    Text("Choose an existing expense from \(cycle.startsOn.value) to \(cycle.through.value).")
                    ForEach(model.candidates) { event in
                        Button {
                            Task { await model.select(event.id) }
                        } label: {
                            VStack(alignment: .leading) {
                                Text(event.description)
                                Text("\(event.amountCentimes.absoluteCHF) · \(event.occurredOn)").font(.caption)
                            }.padding(.vertical, 6)
                        }
                    }
                    if model.candidates.isEmpty { Text("No matching expense in the history loaded so far.") }
                    if model.next != nil { Button("Load older expenses") { Task { await model.load(more: true) } } }
                } else {
                    Text("This rule has no uncovered cycle due for linking.")
                }
            }
            Button("Refresh bill and expenses") { Task { await model.load() } }
        }
    }

    @ViewBuilder
    private func recovery(_ saved: SavedManualCycle) -> some View {
        if let receipt = saved.result?.receipt {
            ManualCycleSummary(
                member: member, input: receipt.input, configuration: receipt.configuration,
                cycle: receipt.cycle, source: receipt.linkedExpense)
        }
        QuietFormSection("Saved link") {
            if let receipt = saved.result?.receipt {
                Text("Existing expense linked. No new expense or balance change was created.")
                NavigationLink("View linked expense") {
                    MoneyDetailScreen(session: session, member: member, eventId: receipt.eventId)
                }
            } else if saved.result?.status == .cancelled {
                Text("Pending link cancelled. No cycle was covered by this request.")
            } else {
                Text("Not confirmed yet. Resolve this exact saved link before linking another expense.")
                QuietValueRow("Due date", value: saved.command.input.dueOn.value)
                NavigationLink("View selected expense") {
                    MoneyDetailScreen(session: session, member: member, eventId: saved.command.input.sourceEventId)
                }
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await model.retry() }
                }
                if !saved.cancellationRequested { Button("Cancel pending link") { confirmCancel = true } }
            }
            if saved.result != nil && saved.result?.status != .unresolved {
                Button("Finish recovery") { Task { await model.finish() } }
            }
        }
    }
}
