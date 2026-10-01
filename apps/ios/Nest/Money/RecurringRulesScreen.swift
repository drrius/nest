import SwiftUI

struct RecurringRulesScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let dueOnly: Bool
    @State private var rules: [RecurringRule] = []
    @State private var next: UUID?
    @State private var loaded = false
    @State private var working = false
    @State private var notice: String?

    var body: some View {
        List {
            Section {
                Text(
                    dueOnly
                        ? "Review each bill’s amount and split before recording it."
                        : "Fixed expenses are added automatically. Variable bills need your confirmation each time."
                )
                .foregroundStyle(QuietPalette.muted)
            }
            if !dueOnly {
                Section {
                    NavigationLink("Retained recurring expenses") {
                        LegacyRecurringScreen(session: session, member: member).id(session.generation)
                    }
                    NavigationLink("New recurring expense") {
                        RecurringEditorScreen(session: session, member: member, ruleId: nil).id(session.generation)
                    }
                }
            }
            ForEach(rules) { rule in
                NavigationLink {
                    RecurringRuleScreen(session: session, member: member, ruleId: rule.id).id(session.generation)
                } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(rule.configuration.description).font(.headline)
                        Text(
                            rule.configuration.mode == .fixed
                                ? "Automatic · \(rule.configuration.amountCentimes?.absoluteCHF ?? "")"
                                : "Confirm each bill")
                        Text(rule.status.rawValue.capitalized).font(.caption).foregroundStyle(QuietPalette.muted)
                        if let due = rule.nextDueOn { Text("Next due \(due.value)").font(.subheadline) }
                    }.padding(.vertical, 4)
                }
            }
            if loaded && rules.isEmpty { Text(dueOnly ? "No bills need confirmation." : "No recurring rules yet.") }
            if let notice { Text(notice) }
            if working { ProgressView("Loading rules…") }
            if next != nil { Button("Load more") { Task { await load(more: true) } }.disabled(working) }
            Button("Refresh") { Task { await load(more: false) } }.disabled(working)
        }
        .navigationTitle(dueOnly ? "Bills to confirm" : "Recurring expenses")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task { await load(more: false) }
        .refreshable { await load(more: false) }
    }

    private func load(more: Bool) async {
        guard !working else { return }
        working = true
        notice = nil
        defer { working = false }
        let cursor = more ? next : nil
        if !more {
            rules = []
            next = nil
            loaded = false
        }
        do {
            let context = try session.expenseContext()
            let page = try await session.readRecurringRules(context, after: cursor, dueOnly: dueOnly)
            try Task.checkCancellation()
            guard page.rules.allSatisfy({ item in !rules.contains(where: { $0.id == item.id }) }) else {
                throw NestAPIFailure.contract
            }
            rules += page.rules
            next = page.next
            loaded = true
        } catch {
            guard !Task.isCancelled else { return }
            notice = "Could not load recurring expenses. Try again online."
        }
    }
}
