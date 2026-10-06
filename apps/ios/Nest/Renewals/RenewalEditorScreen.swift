import SwiftUI

struct RenewalEditorScreen: View {
    @ObservedObject var model: RenewalsModel
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let baseline: CalendarRenewal?
    private let initial: RenewalDraft
    @State private var draft: RenewalDraft
    @State private var discarding = false
    @StateObject private var choices = RenewalChoicesModel()
    @FocusState private var titleFocused: Bool
    @Environment(\.dismiss) private var dismiss

    init(model: RenewalsModel, session: SessionModel, member: VerifiedMember, baseline: CalendarRenewal?) {
        self.model = model
        self.session = session
        self.member = member
        self.baseline = baseline
        let draft = RenewalDraft(renewal: baseline)
        initial = draft
        _draft = State(initialValue: draft)
    }

    var body: some View {
        Form {
            Section("Renewal") {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Title").font(.caption).foregroundStyle(QuietPalette.muted)
                    TextField("e.g. Home insurance", text: $draft.title, axis: .vertical)
                        .focused($titleFocused)
                }
                DatePicker("Renewal date", selection: $draft.date, displayedComponents: .date)
                    .environment(\.calendar, Calendar(identifier: .gregorian))
                Stepper(
                    "Notice: \(draft.noticeDays) \(draft.noticeDays == 1 ? "day" : "days")", value: $draft.noticeDays,
                    in: 0...730)
                if let date = try? draft.fields().cancellationDeadline {
                    Text("Cancel by \(date.value)").foregroundStyle(QuietPalette.muted)
                }
            }.disabled(model.busy || model.saved != nil)
            assignments.disabled(model.busy || model.saved != nil)
            Section {
                Text(
                    "Saving tracks the dates in Nest. It does not cancel your contract, change the linked recurring expense or enable reminders."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
                if let notice = model.notice { Text(notice) }
                if model.busy { ProgressView("Checking your change…") }
                Button("Save renewal") {
                    titleFocused = false
                    Task {
                        guard let fields = try? draft.fields() else { return }
                        await model.save(fields: fields, baseline: baseline, session: session, member: member)
                        if model.saved != nil { dismiss() }
                    }
                }.disabled(model.busy || model.saved != nil || !choices.loaded || (try? draft.fields()) == nil)
            }
        }
        .navigationTitle(baseline == nil ? "New renewal" : "Edit renewal")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .scrollDismissesKeyboard(.interactively)
        .navigationBarBackButtonHidden()
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button {
                    titleFocused = false
                } label: {
                    Text("Done").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain)
            }
            ToolbarItem(placement: .cancellationAction) {
                Button {
                    if draft == initial { dismiss() } else { discarding = true }
                } label: {
                    Text("Cancel").frame(minWidth: 44, minHeight: 44).contentShape(Rectangle())
                }.buttonStyle(.plain).disabled(model.busy)
            }
        }
        .interactiveDismissDisabled(model.busy || draft != initial)
        .alert("Discard edits?", isPresented: $discarding) {
            Button("Discard changes", role: .destructive) { dismiss() }
            Button("Keep editing", role: .cancel) {}
        }
        .task { await choices.load(session: session, member: member) }
    }

    private var assignments: some View {
        Section("Household") {
            Picker("Responsible", selection: $draft.responsibleId) {
                Text("Unassigned").tag(UUID?.none)
                ForEach(choices.members, id: \.actorId) { person in
                    Text(person.displayName).tag(Optional(person.actorId))
                }
            }
            Picker("Linked recurring expense", selection: $draft.recurringRuleId) {
                Text("None").tag(UUID?.none)
                if let id = draft.recurringRuleId, !choices.rules.contains(where: { $0.id == id }) {
                    Text("Existing link · load choices to find it").tag(Optional(id))
                }
                ForEach(choices.rules) { rule in
                    Text("\(rule.configuration.description) · \(rule.status.rawValue)").tag(Optional(rule.id))
                }
            }
            if choices.busy { ProgressView("Loading household choices…") }
            if let notice = choices.notice {
                Text(notice)
                Button("Retry choices") { Task { await choices.load(session: session, member: member) } }
            }
            if choices.next != nil {
                Button("Load more recurring expenses") {
                    Task { await choices.load(session: session, member: member, more: true) }
                }
            }
        }.disabled(choices.busy)
    }
}
