import Foundation

/// A friendly emoji for a meal, derived from its title. Presentation only: nothing is stored.
public enum MealEmoji {
    public static let fallback = "🍽️"

    // Ordered: the first rule whose keyword appears in the title wins, so specific dishes come before ingredients.
    static let rules: [(keywords: [String], emoji: String)] = [
        (["fondue", "raclette"], "🫕"),
        (["leftover"], "🥡"),
        (["pizza"], "🍕"),
        (["taco", "fajita", "quesadilla"], "🌮"),
        (["burrito", "wrap"], "🌯"),
        (["ramen", "noodle", "pho", "udon", "pad thai"], "🍜"),
        (["sushi", "salmon", "poke"], "🍣"),
        (["curry", "dal", "dhal", "tikka", "korma"], "🍛"),
        (["pasta", "spaghetti", "lasagne", "lasagna", "penne", "gnocchi", "carbonara", "bolognese"], "🍝"),
        (["risotto", "paella", "fried rice", "rice bowl"], "🥘"),
        (["soup", "stew", "chili", "chilli", "broth", "minestrone"], "🍲"),
        (["salad", "bowl"], "🥗"),
        (["burger"], "🍔"),
        (["sandwich", "toastie", "panini"], "🥪"),
        (["falafel", "kebab", "gyro", "pita", "flatbread"], "🥙"),
        (["pancake", "crepe", "crêpe", "waffle"], "🥞"),
        (["omelette", "omelet", "egg", "frittata", "shakshuka"], "🍳"),
        (["porridge", "oat", "granola", "muesli", "cereal"], "🥣"),
        (["croissant", "pastry"], "🥐"),
        (["steak", "beef", "roast"], "🥩"),
        (["chicken", "wings", "drumstick"], "🍗"),
        (["fish", "cod", "trout", "tuna"], "🐟"),
        (["prawn", "shrimp"], "🍤"),
        (["dumpling", "gyoza", "bao"], "🥟"),
        (["bread", "toast"], "🍞"),
        (["cheese"], "🧀"),
        (["vegetable", "veg", "tofu"], "🥦"),
        (["dinner out", "restaurant", "takeaway", "take-away", "eat out"], "🍽️"),
    ]

    public static func emoji(for title: String) -> String {
        let text = title.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en"))
        for rule in rules where rule.keywords.contains(where: { text.contains(fold($0)) }) {
            return rule.emoji
        }
        return fallback
    }

    private static func fold(_ word: String) -> String {
        word.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: Locale(identifier: "en"))
    }
}
