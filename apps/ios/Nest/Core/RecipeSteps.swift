import Foundation

/// Splits saved instructions into steps, dropping a leading "1." or "2)" only when a space follows,
/// so quantities such as "1.5 litres" keep their numbers.
public enum RecipeSteps {
    public static func split(_ instructions: String?) -> [String] {
        (instructions ?? "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .map { $0.replacing(/^\d+[.)]\s+/, with: "") }
            .filter { !$0.isEmpty }
    }
}
