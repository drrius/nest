import Foundation

struct RecipeEditDraft: Equatable {
    let baseline: SavedRecipe
    var title: String
    var servings: String
    var instructions: String
    var link: String
    var notes: String
    var ingredients: [RecipeEditIngredient]

    init(_ recipe: SavedRecipe) {
        baseline = recipe
        title = recipe.title
        servings = recipe.servings.map(String.init) ?? ""
        instructions = recipe.instructions ?? ""
        link = recipe.recipeUrl ?? ""
        notes = recipe.notes ?? ""
        ingredients = recipe.ingredients.map(RecipeEditIngredient.init)
    }

    var dirty: Bool { self != Self(baseline) }

    func command(operation: UUID, revision: String) throws -> EditRecipe {
        let servingsValue = servings.isEmpty ? nil : Int(servings)
        guard servings.isEmpty || servingsValue != nil else { throw MealContractError.invalidPlacement }
        let originalServings = baseline.servings.map(String.init) ?? ""
        let patch = RecipeMetadataPatch(
            title: title == baseline.title ? nil : title,
            servings: servings == originalServings ? nil : .some(servingsValue),
            instructions: Self.changed(instructions, original: baseline.instructions),
            recipeUrl: Self.changed(link, original: baseline.recipeUrl),
            notes: Self.changed(notes, original: baseline.notes))
        let selected = ingredients.map(\.selection)
        let unchanged = baseline.ingredients.map { RecipeIngredientSelection.existing($0.id, .init()) }
        return try EditRecipe(
            operationId: operation, definitionId: baseline.id, expectedRevision: revision,
            patch: patch, ingredients: selected == unchanged ? nil : selected
        ).validated(against: baseline)
    }

    static func changed(_ value: String, original: String?) -> String?? {
        value == (original ?? "") ? nil : .some(value.isEmpty ? nil : value)
    }
}

struct RecipeEditIngredient: Identifiable, Equatable {
    let id: UUID
    let original: SavedIngredient?
    var name: String
    var quantity: String
    var unit: String
    var note: String

    init(_ original: SavedIngredient) {
        id = original.id
        self.original = original
        name = original.name
        quantity = original.quantity ?? ""
        unit = original.unit ?? ""
        note = original.note ?? ""
    }

    init() {
        id = UUID()
        original = nil
        name = ""
        quantity = ""
        unit = ""
        note = ""
    }

    var selection: RecipeIngredientSelection {
        guard let original else {
            return .new(
                RecipeIngredientDraft(
                    name: name, quantity: quantity.isEmpty ? nil : quantity,
                    unit: unit.isEmpty ? nil : unit, categoryId: nil, note: note.isEmpty ? nil : note))
        }
        return .existing(
            original.id,
            RecipeIngredientPatch(
                name: name == original.name ? nil : name,
                quantity: RecipeEditDraft.changed(quantity, original: original.quantity),
                unit: RecipeEditDraft.changed(unit, original: original.unit),
                note: RecipeEditDraft.changed(note, original: original.note)))
    }
}
