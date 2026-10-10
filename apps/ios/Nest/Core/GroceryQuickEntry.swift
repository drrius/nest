import Foundation

/// Splits a quick-add line such as "2 avocados" or "500 g mince" into name, quantity and unit.
/// Anything it doesn't recognise stays in the name, so nothing typed is ever lost.
public struct GroceryQuickEntry: Equatable, Sendable {
    public let name: String
    public let quantity: String?
    public let unit: String?

    static let units: Set<String> = [
        "g", "kg", "ml", "l", "cl", "dl", "x", "pack", "packs", "tin", "tins", "can", "cans", "bunch", "bunches",
        "bag", "bags", "jar", "jars", "bottle", "bottles", "loaf", "loaves", "head", "heads", "box", "boxes",
    ]

    public init(name: String, quantity: String? = nil, unit: String? = nil) {
        self.name = name
        self.quantity = quantity
        self.unit = unit
    }

    public static func parse(_ text: String) -> GroceryQuickEntry? {
        let words = text.split(whereSeparator: \.isWhitespace).map(String.init)
        guard let first = words.first else { return nil }
        guard isQuantity(first), words.count > 1 else { return GroceryQuickEntry(name: words.joined(separator: " ")) }
        let rest = Array(words.dropFirst())
        if rest.count > 1, units.contains(rest[0].lowercased()) {
            return GroceryQuickEntry(
                name: rest.dropFirst().joined(separator: " "), quantity: first, unit: rest[0].lowercased())
        }
        return GroceryQuickEntry(name: rest.joined(separator: " "), quantity: first)
    }

    private static func isQuantity(_ word: String) -> Bool {
        word.range(of: #"^\d+([.,]\d+)?$"#, options: .regularExpression) != nil
    }
}
