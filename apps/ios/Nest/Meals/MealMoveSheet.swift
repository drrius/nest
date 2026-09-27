import SwiftUI

struct MealMoveTarget: Identifiable {
    let source: MealWeekStart
    let meal: PlannedMeal
    var id: UUID { meal.id }
}

struct MealMoveSheet: View {
    @ObservedObject var model: SessionModel
    let target: MealMoveTarget
    @Environment(\.dismiss) private var dismiss
    @State private var week: MealWeekStart
    @State private var date: CivilDate
    @State private var slot: MealSlot
    @State private var context: MealMoveContext?
    @State private var notice: String?
    @State private var saving = false
    @State private var request = UUID()

    init(model: SessionModel, target: MealMoveTarget) {
        self.model = model
        self.target = target
        _week = State(initialValue: target.source)
        _date = State(initialValue: target.meal.date)
        _slot = State(initialValue: target.meal.slot)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(context?.meal.title ?? target.meal.title).font(.headline)
                    Text("Choose an empty slot. Your recipe stays with the meal.")
                        .foregroundStyle(QuietPalette.muted)
                }
                Section("Move to") {
                    HStack {
                        Button {
                            changeWeek(-1)
                        } label: {
                            Image(systemName: "chevron.left").frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Previous destination week")
                        .disabled((try? week.adjacent(-1)) == nil)
                        Spacer()
                        Text("Week of \(MealWeekScreen.label(week.date))")
                        Spacer()
                        Button {
                            changeWeek(1)
                        } label: {
                            Image(systemName: "chevron.right").frame(width: 44, height: 44)
                        }
                        .accessibilityLabel("Next destination week")
                        .disabled((try? week.adjacent(1)) == nil)
                    }.buttonStyle(.borderless)
                    Picker("Day", selection: $date) {
                        ForEach(week.days, id: \.self) { day in
                            Text(MealWeekScreen.label(day)).tag(day)
                        }
                    }
                    Picker("Meal", selection: $slot) {
                        ForEach(MealSlot.allCases, id: \.self) { Text($0.label).tag($0) }
                    }
                }.disabled(saving)
                if let context {
                    if !valid(context) {
                        Text("Choose a different, empty meal slot.").foregroundStyle(QuietPalette.muted)
                    }
                } else if notice == nil {
                    ProgressView("Checking both weeks…")
                }
                if let notice {
                    Section {
                        Text(notice)
                        Button("Refresh both weeks") { Task { await load() } }.disabled(saving)
                    }
                }
            }
            .scrollContentBackground(.hidden)
            .background(QuietPalette.background)
            .navigationTitle("Move meal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(saving)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(saving ? "Saving…" : "Move") { Task { await save() } }
                        .disabled(saving || context.map { !valid($0) } != false || model.mealMove != nil)
                }
            }
            .interactiveDismissDisabled(saving)
            .task(id: week) { await load() }
        }
        .tint(QuietPalette.accent)
    }

    private func changeWeek(_ offset: Int) {
        guard let next = try? week.adjacent(offset) else { return }
        context = nil
        notice = nil
        week = next
        date = next.date
    }

    private func valid(_ context: MealMoveContext) -> Bool {
        (try? MoveMeal(
            source: context.source, target: context.target, meal: context.meal,
            operationId: UUID(), date: date, slot: slot)) != nil
    }

    private func load() async {
        let current = UUID()
        request = current
        context = nil
        notice = nil
        do {
            let loaded = try await model.loadMealMove(source: target.source, target: week, entry: target.meal.id)
            guard request == current, !Task.isCancelled else { return }
            context = loaded
        } catch {
            guard request == current, !Task.isCancelled else { return }
            notice = "Could not check both weeks. The meal may have changed. Refresh before moving it."
        }
    }

    private func save() async {
        guard !saving, let context, valid(context) else { return }
        saving = true
        defer { saving = false }
        if await model.moveMeal(context, date: date, slot: slot) {
            dismiss()
        } else {
            notice = "Could not save this move. Refresh both weeks and try again."
        }
    }
}
