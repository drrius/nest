import SwiftUI

struct PlannedRecipeScreen: View {
    @ObservedObject var model: SessionModel
    let target: PlannedRecipeTarget

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if model.plannedRecipeTarget == target {
                    if let notice = model.plannedRecipeNotice {
                        Text(notice).font(.subheadline).foregroundStyle(QuietPalette.muted)
                    }
                    content
                } else {
                    ProgressView("Loading meal…").frame(maxWidth: .infinity, minHeight: 120)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Planned meal")
        .navigationBarTitleDisplayMode(.inline)
        .task(id: target) { await model.loadPlannedRecipe(target) }
        .refreshable { await model.loadPlannedRecipe(target) }
    }

    @ViewBuilder
    private var content: some View {
        switch model.plannedRecipe {
        case .idle, .loading:
            ProgressView("Loading meal…").frame(maxWidth: .infinity, minHeight: 120)
        case .failed:
            Button("Try again") { Task { await model.loadPlannedRecipe(target) } }
                .frame(minHeight: 44, alignment: .leading)
        case .loaded(let value):
            detail(value)
            if !model.plannedRecipeFresh {
                Button("Refresh meal") { Task { await model.loadPlannedRecipe(target) } }
                    .frame(minHeight: 44, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private func detail(_ value: PlannedRecipeEnvelope) -> some View {
        if let entry = value.entry {
            if case .ready(let member) = model.status {
                NavigationLink("Reminder choices") {
                    MealReminderScreen(session: model, member: member, entryId: entry.id).id(model.generation)
                }.frame(minHeight: 44, alignment: .leading)
            }
            let context = "\(MealWeekScreen.label(entry.date)) · \(entry.slot.label)"
            if let snapshot = value.snapshot {
                RecipeContentView(recipe: snapshot.recipe.content, context: context)
                Text(
                    snapshot.recipe.definitionId == nil
                        ? "Saved with this plan. This recipe has not been added to saved meals."
                        : "Saved with this plan. Later library edits leave this recipe unchanged."
                )
                .font(.footnote).foregroundStyle(QuietPalette.muted)
            } else {
                Text(entry.title).font(.largeTitle.weight(.semibold)).foregroundStyle(QuietPalette.ink)
                Text(context).font(.subheadline).foregroundStyle(QuietPalette.muted)
                Text("Ingredients, servings and cooking instructions were not retained for this meal.")
                    .foregroundStyle(QuietPalette.muted)
                if let notes = entry.notes, !notes.isEmpty {
                    Text(notes).foregroundStyle(QuietPalette.ink)
                }
                if let link = MealLibraryText.openableURL(entry.recipeUrl) {
                    Link("Open recipe link", destination: link).frame(minHeight: 52, alignment: .leading)
                }
            }
        } else {
            Text(
                model.plannedRecipeFresh
                    ? "This meal is no longer in this week."
                    : "This saved copy does not contain the meal. Refresh to check the current week."
            )
            .foregroundStyle(QuietPalette.muted)
        }
    }
}
