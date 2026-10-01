import SwiftUI

struct MealPreparationScreen: View {
    @ObservedObject var model: SessionModel
    let target: PlannedRecipeTarget
    @State private var snapshot: MealPreparationEnvelope?
    @State private var context: MealPreparationContext?
    @State private var editing = false
    @State private var loading = false
    @State private var notice: String?
    @State private var request: UUID?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if let notice { Text(notice).foregroundStyle(QuietPalette.muted) }
                if let notice = model.mealPreparationNotice { Text(notice).foregroundStyle(QuietPalette.muted) }
                if let saved = model.mealPreparationRequest { MealPreparationStatus(model: model, saved: saved) }
                if let snapshot { details(snapshot) }
                if loading { ProgressView("Loading preparation…") }
                Button("Refresh preparation") { Task { await load() } }.frame(minHeight: 44)
            }
            .frame(maxWidth: .infinity, alignment: .leading).padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Meal preparation").navigationBarTitleDisplayMode(.inline)
        .task(id: target) { await load() }
        .refreshable { await load() }
        .sheet(isPresented: $editing, onDismiss: { Task { await load() } }) {
            if let context { MealPreparationForm(model: model, context: context).id(context.generation) }
        }
        .onChange(of: model.generation) {
            snapshot = nil
            context = nil
            request = nil
            editing = false
        }
        .onDisappear { request = nil }
    }

    @ViewBuilder
    private func details(_ value: MealPreparationEnvelope) -> some View {
        if let entry = value.entry {
            Text(entry.title).font(.title2.weight(.semibold))
            Text(MealWeekScreen.label(entry.date)).font(.subheadline).foregroundStyle(QuietPalette.muted)
            if let preparation = value.preparation {
                VStack(alignment: .leading, spacing: 12) {
                    Text(preparation.title).font(.headline)
                    Text("Due \(MealWeekScreen.label(preparation.dueOn))")
                    Text(assignment(preparation.assignment))
                    if let instructions = preparation.instructions, !instructions.isEmpty { Text(instructions) }
                    Text("\(preparation.status.rawValue.capitalized) · \(preparation.state.rawValue.capitalized)")
                        .font(.caption).foregroundStyle(QuietPalette.muted)
                }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                    .background(QuietPalette.surface, in: RoundedRectangle(cornerRadius: 20))
            } else {
                Text("No preparation linked yet.").foregroundStyle(QuietPalette.muted)
            }
            if let context, context.baseline.preparation?.state != .archived {
                Button(value.preparation == nil ? "Add preparation" : "Edit preparation") { editing = true }
                    .frame(minHeight: 44).disabled(model.mealPreparationRequest != nil || loading)
            }
            Text("Preparation is a household task. It does not change the meal plan or record an expense.")
                .font(.footnote).foregroundStyle(QuietPalette.muted)
        } else {
            Text("This meal is no longer in this week.").foregroundStyle(QuietPalette.muted)
        }
    }

    private func assignment(_ value: RoutineAssignment) -> String {
        switch value {
        case .shared: return "Shared"
        case .assigned(let id): return "Assigned to \(name(id))"
        case .alternating(let id): return "Take turns · first turn \(name(id))"
        }
    }

    private func name(_ id: UUID) -> String {
        context?.roster.members.first(where: { $0.actorId == id })?.displayName ?? "household member"
    }

    private func load() async {
        let attempt = model.generation
        let current = UUID()
        request = current
        loading = true
        context = nil
        defer { if request == current { loading = false } }
        do {
            let cached = try await model.cachedMealPreparation(target)
            guard request == current, model.generation == attempt else { return }
            snapshot = cached
            await model.restorePreparationRecovery()
            let fresh = try await model.loadMealPreparationContext(target)
            guard request == current, model.generation == attempt else { return }
            snapshot = fresh.baseline
            context = fresh
            notice = nil
        } catch {
            guard request == current, model.generation == attempt else { return }
            await model.preparationReadFailed(error, attempt: attempt)
            guard request == current, model.generation == attempt else { return }
            notice =
                snapshot == nil
                ? "Could not load preparation. Connect and try again."
                : "Saved copy · may be out of date. Connect and refresh before making changes."
        }
    }
}
