import SwiftUI

struct LegacyDraftsScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let rule: LegacyRecurringRule?
    @StateObject private var model: LegacyDraftModel

    init(session: SessionModel, member: VerifiedMember, rule: LegacyRecurringRule) {
        self.session = session
        self.member = member
        self.rule = rule
        _model = StateObject(wrappedValue: LegacyDraftModel(session: session, member: member, ruleId: rule.id))
    }

    init(session: SessionModel, member: VerifiedMember, ruleId: UUID) {
        self.session = session
        self.member = member
        self.rule = nil
        _model = StateObject(wrappedValue: LegacyDraftModel(session: session, member: member, ruleId: ruleId))
    }

    var body: some View {
        List {
            if let rule { LegacyRecurringTerms(rule: rule, member: member) }
            Section {
                NavigationLink("Review moving this rule to Nest") {
                    LegacyAdoptionScreen(session: session, member: member, ruleId: model.ruleId).id(session.generation)
                }
            }
            QuietFormSection("Retained drafts") {
                ForEach(model.drafts) { draft in
                    NavigationLink {
                        LegacyDraftScreen(session: session, member: member, draft: draft).id(session.generation)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(LegacyRecurringLabel.display(draft.description)).font(.headline)
                            Text(draft.amountCentimes?.absoluteCHF ?? "Amount needs review")
                            Text("\(draft.status.rawValue.capitalized) · \(draft.occurredOn.display)")
                                .font(.subheadline).foregroundStyle(QuietPalette.muted)
                            if draft.needsReconciliation { Text("Retained status needs review.").font(.footnote) }
                        }.padding(.vertical, 4)
                    }
                }
                if model.loaded && model.drafts.isEmpty { Text("No retained drafts for this rule.") }
                if let notice = model.notice { Text(notice) }
                if model.working { ProgressView("Loading drafts…") }
                if model.next != nil {
                    Button("Load more") { Task { await model.load(more: true) } }.disabled(model.working)
                }
                Button("Refresh drafts") { Task { await model.load() } }.disabled(model.working)
            }
        }
        .navigationTitle("Retained rule")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .task(id: session.generation) { await model.load() }
        .refreshable { await model.load() }
    }
}

struct LegacyRecurringTerms: View {
    let rule: LegacyRecurringRule
    let member: VerifiedMember

    var body: some View {
        QuietFormSection("Retained rule terms") {
            Text(rule.description).font(.headline)
            QuietValueRow("Amount", value: rule.amountCentimes.absoluteCHF)
            LegacySplitTerms(split: rule.allocations, payerId: rule.payerId, member: member)
            QuietValueRow("Old rule", value: rule.active ? "Active · draft only" : "Inactive · draft only")
            QuietValueRow("Next old date", value: rule.nextOccurrenceOn.display)
            if rule.updatedAt.kind == .unsupported { Text("The old change date needs review.") }
            if let weekday = rule.schedule.weekday {
                QuietValueRow("Schedule", value: "Every \(Calendar.current.weekdaySymbols[weekday % 7])")
            }
            if let day = rule.schedule.dayOfMonth { QuietValueRow("Schedule", value: "Day \(day) of each month") }
            if rule.drafts.needsReconciliation {
                Text("These retained counts need reconciliation. Viewing this rule does not change your balance.")
                QuietValueRow("Posted without an entry", value: rule.drafts.postedWithoutEvent)
                QuietValueRow("Unposted with an entry", value: rule.drafts.unpostedWithEvent)
                QuietValueRow("Unsupported dates", value: rule.drafts.unsupportedDates)
            }
            Text("Drafts keep their original amount and split even when this rule later changed.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        }
    }
}
