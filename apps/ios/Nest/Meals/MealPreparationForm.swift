import SwiftUI

struct MealPreparationForm: View {
    @ObservedObject var model: SessionModel
    let context: MealPreparationContext
    @State private var draft: MealPreparationFormDraft
    @State private var saving = false
    @State private var discard = false
    @FocusState private var focus: String?
    @Environment(\.dismiss) private var dismiss

    init(model: SessionModel, context: MealPreparationContext) {
        self.model = model
        self.context = context
        _draft = State(initialValue: MealPreparationFormDraft(context.baseline))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Preparation") {
                    RecipeDraftField(label: "Task", text: $draft.title, key: "title", focus: $focus)
                    RecipeDraftField(
                        label: "Instructions", text: $draft.instructions, key: "instructions",
                        focus: $focus, axis: .vertical, lines: 2...8)
                    if finished {
                        Text(
                            "This task is finished. You can update its name and instructions; its date and responsibility stay the same."
                        )
                        .font(.footnote)
                    } else {
                        DatePicker("Due", selection: dateBinding, displayedComponents: .date)
                    }
                }
                if !finished {
                    assignmentFields
                    SchedulingWarningSection(session: model, day: dateBinding.wrappedValue)
                }
                Section {
                    Text("This creates or edits the linked household task. Reminders stay separate.").font(.footnote)
                    if let notice = model.mealPreparationNotice { Text(notice) }
                }
            }
            .disabled(saving)
            .modifier(RecipeEditorKeyboard(focus: $focus))
            .scrollContentBackground(.hidden).background(QuietPalette.background)
            .navigationTitle(context.baseline.preparation == nil ? "Add preparation" : "Edit preparation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    QuietToolbarButton("Cancel", systemImage: "xmark") {
                        if hasChanges { discard = true } else { dismiss() }
                    }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    QuietToolbarButton("Save", systemImage: "checkmark") { Task { await save() } }.disabled(!canSave)
                }
            }
            .interactiveDismissDisabled(saving || hasChanges)
            .confirmationDialog("Discard preparation changes?", isPresented: $discard, titleVisibility: .visible) {
                Button("Discard changes", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
        }.tint(QuietPalette.accent)
    }

    private var finished: Bool { context.baseline.preparation.map { $0.status != .open } ?? false }

    private var hasChanges: Bool { draft != MealPreparationFormDraft(context.baseline) }

    private var canSave: Bool {
        !saving && model.mealPreparationRequest == nil && model.generation == context.generation
            && (try? draft.command(operation: UUID())) != nil
    }

    private var dateBinding: Binding<Date> {
        Binding(
            get: { dateFormatter.date(from: draft.dueOn)! },
            set: { draft.dueOn = dateFormatter.string(from: $0) })
    }

    private var dateFormatter: DateFormatter {
        let value = DateFormatter()
        value.calendar = Calendar(identifier: .gregorian)
        value.locale = Locale(identifier: "en_US_POSIX")
        value.dateFormat = "yyyy-MM-dd"
        return value
    }

    private var assignmentFields: some View {
        Section("Who handles it?") {
            Picker("Assignment", selection: $draft.policy) {
                Text("Shared").tag("shared")
                Text("One person").tag("assigned")
                Text("Take turns").tag("alternating")
            }
            if draft.policy != "shared" {
                Picker(draft.policy == "alternating" ? "First turn" : "Person", selection: $draft.memberId) {
                    Text("Choose a person").tag(UUID?.none)
                    ForEach(context.roster.members, id: \.actorId) { member in
                        Text(member.displayName).tag(Optional(member.actorId))
                    }
                }
            }
        }
    }

    private func save() async {
        guard canSave, let command = try? draft.command(operation: UUID()) else { return }
        focus = nil
        saving = true
        defer { saving = false }
        if await model.saveMealPreparation(command, context: context) { dismiss() }
    }
}
