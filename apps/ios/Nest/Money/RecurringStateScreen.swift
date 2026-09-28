import SwiftUI

struct RecurringStateScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID
    @State private var context: ExpenseContext?
    @State private var rule: RecurringRule?
    @State private var saved: SavedRecurringState?
    @State private var action: RecurringStateInput.Action?
    @State private var working = false
    @State private var notice: String?
    @State private var confirmAbandon = false

    var body: some View {
        List {
            if let saved {
                recovery(saved)
            } else if let rule {
                Section {
                    Text(rule.configuration.description).font(.headline)
                    Text(rule.status.rawValue.capitalized)
                    Text(
                        "Pausing or cancelling stops future entries from this rule. Existing financial history stays unchanged."
                    )
                }
                if rule.status == .active {
                    Section { Button("Pause rule") { action = .pause } }
                }
                if rule.status != .cancelled {
                    Section { Button("Cancel rule", role: .destructive) { action = .cancel } }
                }
            }
            if let notice { Text(notice) }
            if working { ProgressView("Checking rule…") }
            Button("Refresh") { Task { await load() } }.disabled(working)
        }
        .disabled(working)
        .navigationTitle("Manage rule")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load() }
        .confirmationDialog(
            action == .pause ? "Pause this rule?" : "Cancel this rule?",
            isPresented: Binding(get: { action != nil }, set: { if !$0 { action = nil } })
        ) {
            if let action {
                Button(action == .pause ? "Pause rule" : "Cancel rule", role: .destructive) {
                    Task { await save(action) }
                }
            }
        } message: {
            Text(
                "Recorded expenses remain in your history. This does not cancel a payment or subscription with its provider."
            )
        }
        .confirmationDialog("Cancel the pending request?", isPresented: $confirmAbandon) {
            Button("Cancel pending request", role: .destructive) { Task { await resolve(cancel: true) } }
        } message: {
            Text("If the rule change was already recorded, its result will be recovered.")
        }
    }

    private func recovery(_ saved: SavedRecurringState) -> some View {
        Section("Saved rule change") {
            Text(saved.command.change.action == .pause ? "Pause rule" : "Cancel rule").font(.headline)
            NavigationLink("View affected rule") {
                RecurringRuleScreen(session: session, member: member, ruleId: saved.command.change.ruleId)
            }
            if let receipt = saved.result?.receipt {
                Text("Rule \(receipt.status.rawValue).")
                Button("Done") { Task { await finish() } }
            } else if saved.result?.status == .cancelled {
                Text("The pending request was cancelled.")
                Button("Continue") { Task { await finish() } }
            } else {
                Text("Not confirmed yet. Resolve this request before changing another rule.")
                Button(saved.cancellationRequested ? "Retry cancellation" : "Check and retry") {
                    Task { await resolve(cancel: false) }
                }
                if !saved.cancellationRequested {
                    Button("Cancel pending request") { confirmAbandon = true }
                }
            }
        }
    }

    private func load() async {
        await perform {
            let current = try session.expenseContext()
            context = current
            saved = try await session.savedRecurringState(current)
            if saved == nil {
                rule = nil
                rule = try await session.readRecurringRule(current, ruleId: ruleId).rule
            }
        }
    }
    private func save(_ action: RecurringStateInput.Action) async {
        guard let context, let rule else { return }
        await perform {
            let input = RecurringStateInput(
                ruleId: rule.id, expectedRevision: rule.revision,
                expectedStatus: rule.status, action: action)
            try await session.stageRecurringState(input, context: context)
            saved = try await session.savedRecurringState(context)
            saved = try await session.retryRecurringState(context)
        }
    }
    private func resolve(cancel: Bool) async {
        guard let context else { return }
        await perform {
            saved = try await (cancel ? session.cancelRecurringState(context) : session.retryRecurringState(context))
        }
    }
    private func finish() async {
        guard let context, let saved else { return }
        await perform {
            try await session.finishRecurringState(context, operation: saved.command.operationId)
            self.saved = nil
            rule = nil
            rule = try await session.readRecurringRule(context, ruleId: ruleId).rule
        }
    }
    private func perform(_ work: () async throws -> Void) async {
        guard !working else { return }
        working = true
        defer { working = false }
        do {
            try await work()
            notice = nil
        } catch {
            if let context { saved = try? await session.savedRecurringState(context) }
            notice = "Could not confirm the rule change. Resolve any saved request, then refresh for its latest state."
        }
    }
}
