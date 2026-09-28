import SwiftUI

struct ProposalRecipeScreen: View {
    let entry: ProposedMeal
    private let content: RecipeContent

    init(entry: ProposedMeal) {
        self.entry = entry
        switch entry.source {
        case .saved(_, let recipe): content = recipe.content
        case .suggested(let recipe):
            content = RecipeContent(
                title: recipe.title, servings: recipe.servings, recipeUrl: recipe.recipeUrl,
                notes: recipe.notes, instructions: recipe.instructions,
                ingredients: recipe.ingredients.enumerated().map { index, ingredient in
                    SavedIngredient(
                        ingredientId: UUID(), name: ingredient.name, quantity: ingredient.quantity,
                        unit: ingredient.unit, categoryId: ingredient.categoryId, note: ingredient.note, order: index)
                })
        }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                RecipeContentView(
                    recipe: content,
                    context: "\(MealWeekScreen.label(entry.date)) · \(entry.slot.label)")
                if let calories = entry.estimatedCaloriesPerServing {
                    Text("Estimated \(calories) kcal per serving. This is an estimate, not a measured value.")
                        .font(.footnote).foregroundStyle(QuietPalette.muted)
                }
                Text("This is a suggestion. Return to the plan to approve the reviewed meals together.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }.padding(20)
        }
        .background(QuietPalette.background)
        .navigationTitle("Suggested meal")
        .navigationBarTitleDisplayMode(.inline)
    }
}
