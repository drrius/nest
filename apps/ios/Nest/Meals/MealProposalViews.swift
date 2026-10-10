import SwiftUI

/// Title block for each stage of planning, with a pill that makes "draft" unmistakable.
struct ProposalHeader: View {
    let stage: ProposalStage

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            NestPill(text: stage.pill, systemImage: stage.symbol, tone: stage.tone)
            Text(stage.title).font(.largeTitle.weight(.bold)).foregroundStyle(NestColor.ink)
                .accessibilityAddTraits(.isHeader)
            Text(stage.subtitle).font(.subheadline).foregroundStyle(NestColor.ink2)
        }
    }
}

enum ProposalStage: Equatable {
    case ask, thinking, draft, saved, failed, discarded

    var pill: String {
        switch self {
        case .ask: "Next step: suggestions"
        case .thinking: "Thinking"
        case .draft: "Draft · not saved yet"
        case .saved: "Saved to your week"
        case .failed: "Couldn’t plan"
        case .discarded: "Discarded"
        }
    }

    var symbol: String {
        switch self {
        case .ask, .thinking: "sparkles"
        case .draft: "pencil"
        case .saved: "checkmark"
        case .failed, .discarded: "xmark"
        }
    }

    var tone: NestPill.Tone {
        switch self {
        case .ask, .thinking: .meal
        case .draft: .warn
        case .saved: .good
        case .failed, .discarded: .neutral
        }
    }

    var title: String {
        switch self {
        case .ask: "Plan the week"
        case .thinking: "Planning your week…"
        case .draft: "Here’s your week"
        case .saved: "Week planned"
        case .failed: "No plan this time"
        case .discarded: "Plan discarded"
        }
    }

    var subtitle: String {
        switch self {
        case .ask: "Nest suggests meals for the open slots. Nothing is saved until you approve."
        case .thinking: "Checking your favourites, what you both avoid and your evenings."
        case .draft: "Swap anything you don’t fancy, then save it to the shared week."
        case .saved: "Review the ingredients from Meals whenever you’re ready."
        case .failed: "Your household week hasn’t changed."
        case .discarded: "Your household week hasn’t changed."
        }
    }
}

/// One suggested meal. Saved meals are favourites; new ideas are marked as new.
struct ProposalMealRow: View {
    let entry: ProposedMeal
    var canSwap = false
    var swap: () -> Void = {}

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            MealDayLabel(date: entry.date, isToday: false)
            HStack(spacing: 12) {
                NavigationLink {
                    ProposalRecipeScreen(entry: entry)
                } label: {
                    HStack(spacing: 12) {
                        EmojiTile(emoji: MealEmoji.emoji(for: title), size: 46)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(title).font(.body.weight(.medium)).foregroundStyle(NestColor.ink)
                                .multilineTextAlignment(.leading)
                            meta
                        }
                        Spacer(minLength: 0)
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(NestPressStyle())
                if canSwap {
                    Button(action: swap) {
                        Image(systemName: "shuffle").font(.subheadline.weight(.semibold))
                            .foregroundStyle(NestColor.ink2)
                            .frame(width: 40, height: 40)
                            .background(NestColor.fill, in: Circle())
                    }
                    .buttonStyle(NestPressStyle())
                    .accessibilityLabel("Change suggestion")
                }
            }
            .padding(10)
            .nestCard(padding: 0, radius: 20)
        }
    }

    private var meta: some View {
        HStack(spacing: 4) {
            Text(entry.slot.rawValue.capitalized)
            Text("·")
            if case .saved = entry.source {
                Text("♥ Favourite").foregroundStyle(NestColor.tint(.bill))
            } else {
                Text("✦ New").foregroundStyle(NestColor.accentInk)
            }
            if let calories = entry.estimatedCaloriesPerServing {
                Text("· ~\(calories) kcal")
            }
        }
        .font(.footnote)
        .foregroundStyle(NestColor.ink2)
        .lineLimit(1)
    }

    private var title: String {
        switch entry.source {
        case .saved(_, let recipe): recipe.title
        case .suggested(let recipe): recipe.title
        }
    }
}

/// Placeholder rows that shimmer while suggestions are on their way.
struct ProposalThinkingRows: View {
    @State private var phase = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(spacing: 12) {
            ForEach(0..<5, id: \.self) { index in
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 10).fill(NestColor.fill2).frame(width: 44, height: 50)
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: 14).fill(NestColor.fill2).frame(width: 46, height: 46)
                        VStack(alignment: .leading, spacing: 8) {
                            RoundedRectangle(cornerRadius: 5).fill(NestColor.fill2)
                                .frame(width: CGFloat(110 + index * 17 % 60), height: 13)
                            RoundedRectangle(cornerRadius: 5).fill(NestColor.fill).frame(width: 70, height: 10)
                        }
                        Spacer()
                    }
                    .padding(10)
                    .background(NestColor.fill, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .opacity(phase ? 0.45 : 1)
                .animation(
                    reduceMotion
                        ? nil
                        : .easeInOut(duration: 0.9).repeatForever().delay(Double(index) * 0.12),
                    value: phase)
            }
        }
        .onAppear { phase = true }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Preparing suggestions")
    }
}
