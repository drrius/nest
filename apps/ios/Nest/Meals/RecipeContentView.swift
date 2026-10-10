import SwiftUI

struct RecipeContentView: View {
    let recipe: RecipeContent
    let context: String?
    @State private var showingMethod = false
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(recipe: RecipeContent, context: String? = nil) {
        self.recipe = recipe
        self.context = context
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 22) {
            hero
            VStack(alignment: .leading, spacing: 8) {
                if let context {
                    Text(context.uppercased())
                        .font(.caption.weight(.bold)).tracking(0.4).foregroundStyle(NestColor.tint(.meal))
                }
                Text(recipe.title)
                    .font(.largeTitle.weight(.bold))
                    .foregroundStyle(NestColor.ink)
                    .accessibilityAddTraits(.isHeader)
                if let servings = recipe.servings {
                    NestPill(text: "Serves \(servings)", systemImage: "person.2", tone: .neutral)
                }
            }
            if let notes = recipe.notes, !notes.isEmpty {
                Text(notes).foregroundStyle(NestColor.ink2)
            }
            Picker("Show", selection: $showingMethod) {
                Text("Ingredients").tag(false)
                Text("Method").tag(true)
            }
            .pickerStyle(.segmented)
            if showingMethod { method } else { ingredients }
            if let link = MealLibraryText.openableURL(recipe.recipeUrl) {
                Link(destination: link) {
                    Label("Open recipe link", systemImage: "safari")
                }
                .buttonStyle(NestButtonStyle(kind: .secondary, fullWidth: true))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: showingMethod)
    }

    private var hero: some View {
        Text(MealEmoji.emoji(for: recipe.title))
            .font(.system(size: 104))
            .scaleEffect(appeared || reduceMotion ? 1 : 0.6)
            .rotationEffect(.degrees(appeared || reduceMotion ? 0 : -12))
            .frame(maxWidth: .infinity, minHeight: 190)
            .background(
                RadialGradient(
                    colors: [NestColor.card.opacity(0.8), NestColor.tintSoft(.meal)], center: .top, startRadius: 10,
                    endRadius: 260),
                in: RoundedRectangle(cornerRadius: 28, style: .continuous)
            )
            .accessibilityHidden(true)
            .onAppear {
                withAnimation(.spring(response: 0.55, dampingFraction: 0.6).delay(0.05)) { appeared = true }
            }
    }

    private var ingredients: some View {
        VStack(spacing: 0) {
            if recipe.ingredients.isEmpty {
                Text("No ingredients saved.").foregroundStyle(NestColor.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading).padding(16)
            }
            ForEach(Array(recipe.ingredients.enumerated()), id: \.element.id) { index, ingredient in
                if index > 0 { NestRowDivider(leading: 16) }
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(ingredient.name).foregroundStyle(NestColor.ink)
                        if let note = ingredient.note, !note.isEmpty {
                            Text(note).font(.footnote).foregroundStyle(NestColor.ink2)
                        }
                    }
                    Spacer(minLength: 8)
                    Text(amount(ingredient))
                        .font(.system(.subheadline, design: .rounded)).monospacedDigit()
                        .foregroundStyle(NestColor.ink2)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 13)
                .accessibilityElement(children: .combine)
            }
        }
        .nestCard(padding: 0)
    }

    private var method: some View {
        VStack(alignment: .leading, spacing: 14) {
            if steps.isEmpty {
                Text("No cooking instructions saved.").foregroundStyle(NestColor.ink2)
            }
            ForEach(Array(steps.enumerated()), id: \.offset) { index, step in
                HStack(alignment: .firstTextBaseline, spacing: 14) {
                    Text("\(index + 1)")
                        .font(.system(.subheadline, design: .rounded, weight: .bold))
                        .foregroundStyle(NestColor.tint(.meal))
                        .frame(width: 28, height: 28)
                        .background(NestColor.tintSoft(.meal), in: Circle())
                    Text(step).foregroundStyle(NestColor.ink).fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var steps: [String] {
        (recipe.instructions ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .map { $0.replacing(/^\d+[.)]\s*/, with: "") }
            .filter { !$0.isEmpty }
    }

    private func amount(_ ingredient: SavedIngredient) -> String {
        [ingredient.quantity, ingredient.unit]
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }.joined(separator: " ")
    }
}
