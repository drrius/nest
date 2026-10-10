import SwiftUI

/// A grocery row: a big tick target, the name, the amount, and which dinner it's for.
struct GroceryRowLabel: View {
    let local: LocalGrocery

    var body: some View {
        HStack(spacing: 14) {
            CheckCircle(isOn: local.checked, pending: local.state == .pending)
            Text(local.item.name)
                .foregroundStyle(local.checked ? NestColor.ink3 : NestColor.ink)
                .strikethrough(local.checked, color: NestColor.ink3)
            Spacer(minLength: 8)
            if let amount {
                Text(amount)
                    .font(.system(.subheadline, design: .rounded)).monospacedDigit()
                    .foregroundStyle(NestColor.ink2)
            }
            if let meal = local.item.mealSource?.title {
                Text(MealEmoji.emoji(for: meal))
                    .font(.system(size: 15))
                    .frame(width: 28, height: 28)
                    .background(NestColor.fill, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .accessibilityLabel("For \(meal)")
            }
        }
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }

    private var amount: String? {
        let text = [local.item.quantity, local.item.unit].compactMap { $0 }.joined(separator: " ")
        return text.isEmpty ? nil : text
    }
}

/// Open items grouped by their category ("aisle"), alphabetically, with uncategorised items last.
enum GroceryAisles {
    struct Aisle {
        let name: String
        let items: [LocalGrocery]
    }

    static func group(_ items: [LocalGrocery]) -> [Aisle] {
        let other = "Other"
        var order: [String] = []
        var buckets: [String: [LocalGrocery]] = [:]
        for item in items {
            let name = item.item.categoryName?.trimmingCharacters(in: .whitespaces).nonEmpty ?? other
            if buckets[name] == nil { order.append(name) }
            buckets[name, default: []].append(item)
        }
        let sorted =
            order.filter { $0 != other }.sorted { $0.localizedCompare($1) == .orderedAscending }
            + order.filter { $0 == other }
        return sorted.map { Aisle(name: $0, items: buckets[$0] ?? []) }
    }
}

extension String {
    var nonEmpty: String? { isEmpty ? nil : self }
}
