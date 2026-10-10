import SwiftUI

struct PlannedRecipeScreen: View {
    @ObservedObject var model: SessionModel
    let target: PlannedRecipeTarget

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if model.plannedRecipeTarget == target {
                    if let notice = model.plannedRecipeNotice {
                        Text(notice).font(.subheadline).foregroundStyle(NestColor.ink2)
                    }
                    content
                } else {
                    ProgressView("Loading meal…").frame(maxWidth: .infinity, minHeight: 120)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20)
        }
        .nestScreen()
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
            let context = "\(MealWeekScreen.label(entry.date)) · \(entry.slot.label)"
            if let snapshot = value.snapshot {
                RecipeContentView(recipe: snapshot.recipe.content, context: context)
            } else {
                retainedOnly(entry, context: context)
            }
            planCard(entry)
            if value.snapshot?.recipe.definitionId == nil, value.snapshot != nil {
                Text("Saved with this plan only. Add it to saved meals to reuse it.")
                    .font(.footnote).foregroundStyle(NestColor.ink3)
            }
        } else {
            Text(
                model.plannedRecipeFresh
                    ? "This meal is no longer in this week."
                    : "This saved copy does not contain the meal. Refresh to check the current week."
            )
            .foregroundStyle(NestColor.ink2)
        }
    }

    @ViewBuilder
    private func retainedOnly(_ entry: PlannedMeal, context: String) -> some View {
        Text(MealEmoji.emoji(for: entry.title)).font(.system(size: 96))
            .frame(maxWidth: .infinity, minHeight: 170)
            .background(NestColor.tintSoft(.meal), in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        Text(context.uppercased()).font(.caption.weight(.bold)).tracking(0.4).foregroundStyle(NestColor.ink2)
        Text(entry.title).font(.largeTitle.weight(.bold)).foregroundStyle(NestColor.ink)
        if let notes = entry.notes, !notes.isEmpty { Text(notes).foregroundStyle(NestColor.ink2) }
        Text("No ingredients or method were saved for this meal.").font(.subheadline).foregroundStyle(NestColor.ink3)
        if let link = MealLibraryText.openableURL(entry.recipeUrl) {
            Link(destination: link) { Label("Open recipe link", systemImage: "safari") }
                .buttonStyle(NestButtonStyle(kind: .secondary, fullWidth: true))
        }
    }

    private func planCard(_ entry: PlannedMeal) -> some View {
        VStack(spacing: 0) {
            NavigationLink {
                MealPreparationScreen(model: model, target: target).id(model.generation)
            } label: {
                TodayForYouRow(
                    icon: "frying.pan", domain: .meal, title: "Meal preparation",
                    detail: "A prep task for one of you, if it needs one")
            }
            .buttonStyle(NestPressStyle())
            if case .ready(let member) = model.status {
                NestRowDivider(leading: 64)
                NavigationLink {
                    MealReminderScreen(session: model, member: member, entryId: entry.id).id(model.generation)
                } label: {
                    TodayForYouRow(
                        icon: "bell", domain: .bill, title: "Reminder choices", detail: "Who gets a nudge, and when")
                }
                .buttonStyle(NestPressStyle())
            }
        }
        .nestCard(padding: 0)
    }
}
