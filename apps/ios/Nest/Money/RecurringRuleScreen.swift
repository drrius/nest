import SwiftUI

struct RecurringRuleScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let ruleId: UUID
    @State private var detail: RecurringDetail?
    @State private var working = false
    @State private var notice: String?

    var body: some View {
        List {
            if let rule = detail?.rule {
                Section {
                    Text(rule.configuration.description).font(.title2.weight(.semibold))
                    Text(rule.status.rawValue.capitalized)
                    Text(
                        rule.configuration.mode == .fixed
                            ? "This rule automatically records a shared expense each cycle. Nest does not transfer money."
                            : "Each bill needs its amount and split confirmed before an expense is recorded."
                    )
                    .foregroundStyle(QuietPalette.muted)
                }
                Section {
                    NavigationLink("Manage rule") {
                        RecurringStateScreen(session: session, member: member, ruleId: ruleId).id(session.generation)
                    }
                }
                Section {
                    NavigationLink("Resume or recover resume") {
                        RecurringResumeScreen(session: session, member: member, ruleId: ruleId).id(session.generation)
                    }
                }
                Section("Schedule") {
                    Text(schedule(rule.configuration.schedule))
                    LabeledContent("Starts", value: rule.configuration.startDate.value)
                    if let next = rule.nextDueOn { LabeledContent("Next due", value: next.value) }
                    if let covered = rule.coveredThrough { LabeledContent("Covered through", value: covered.value) }
                }
                Section("Expense details") {
                    LabeledContent("Payer", value: name(rule.configuration.payerId))
                    if let amount = rule.configuration.amountCentimes {
                        LabeledContent("Amount", value: amount.absoluteCHF)
                    }
                    if let shares = rule.configuration.allocations {
                        ForEach(shares, id: \.memberId) {
                            LabeledContent(name($0.memberId), value: $0.centimes.absoluteCHF)
                        }
                    }
                    if let note = rule.configuration.note { Text(note) }
                }
            }
            if let notice { Text(notice) }
            if working { ProgressView("Loading rule…") }
            Button("Refresh rule") { Task { await load() } }.disabled(working)
        }
        .navigationTitle("Recurring expense")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task(id: ruleId) { await load() }
    }

    private func name(_ id: UUID) -> String { id == member.userId ? "You" : "Your partner" }
    private func schedule(_ value: RecurringSchedule) -> String {
        if value.kind == .monthly { return "Monthly on day \(value.dayOfMonth ?? 1)" }
        let names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
        return "Weekly on \(names[(value.weekday ?? 1) - 1])"
    }
    private func load() async {
        guard !working else { return }
        working = true
        detail = nil
        notice = nil
        defer { working = false }
        do {
            let context = try session.expenseContext()
            let result = try await session.readRecurringRule(context, ruleId: ruleId)
            try Task.checkCancellation()
            detail = result
        } catch {
            guard !Task.isCancelled else { return }
            notice = "Could not load this rule. Try again online."
        }
    }
}
