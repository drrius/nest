import SwiftUI

private struct SampleChore: Identifiable {
    let id: Int
    let title: String
    let detail: String
    let owner: String
}

struct QuietTodayView: View {
    @State private var everyone = false
    @State private var completed: Set<Int> = []

    private let chores = [
        SampleChore(id: 0, title: "Water the plants", detail: "Today · every Saturday", owner: "Shared"),
        SampleChore(id: 1, title: "Put on a load of laundry", detail: "Today", owner: "You"),
        SampleChore(id: 2, title: "Take out the recycling", detail: "Due yesterday", owner: "Shared"),
        SampleChore(id: 3, title: "Change the bed linen", detail: "Partner · today", owner: "Partner")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SpikeLabel(text: "Design study · fictional data")
                SpikeHeader(
                    eyebrow: "Saturday, 19 September",
                    title: "Today",
                    subtitle: "A good day to keep it simple."
                )
                scopeControl
                choreSection
                dinnerCard
                groceriesRow
                comingUp
                assistantButton
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 24)
        }
        .scrollIndicators(.hidden)
        .background(QuietPalette.background)
    }

    private var scopeControl: some View {
        HStack(spacing: 12) {
            Picker("Show chores", selection: $everyone) {
                Text("Me + shared").tag(false)
                Text("Everyone").tag(true)
            }
            .pickerStyle(.segmented)
            Button {} label: {
                Image(systemName: "plus")
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("Prototype add action")
        }
        .tint(QuietPalette.accent)
        .padding(.top, 18)
    }

    private var choreSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                SpikeSectionTitle(text: "Around the house")
                Spacer()
                Text("\(completed.count) of \(everyone ? 4 : 3) done")
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
            }
            ForEach(chores.filter { everyone || $0.id != 3 }) { chore in
                choreRow(chore)
            }
        }
    }

    private func choreRow(_ chore: SampleChore) -> some View {
        Button {
            if completed.contains(chore.id) {
                completed.remove(chore.id)
            } else {
                completed.insert(chore.id)
            }
        } label: {
            HStack(spacing: 12) {
                Image(systemName: completed.contains(chore.id) ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(QuietPalette.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text(chore.title)
                        .font(.subheadline)
                        .foregroundStyle(QuietPalette.ink)
                    Text(chore.detail)
                        .font(.caption)
                        .foregroundStyle(QuietPalette.muted)
                }
                Spacer(minLength: 8)
                Text(chore.owner)
                    .font(.caption2)
                    .foregroundStyle(QuietPalette.muted)
            }
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(chore.title), \(chore.detail), \(chore.owner)")
        .accessibilityValue(completed.contains(chore.id) ? "Done" : "Not done")
        .overlay(alignment: .bottom) { QuietPalette.line.frame(height: 1) }
    }

    private var dinnerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("TONIGHT’S DINNER")
                    .font(.caption2.weight(.semibold))
                    .tracking(0.5)
                Spacer()
                Image(systemName: "fork.knife")
            }
            .foregroundStyle(QuietPalette.muted)
            Text("Lemon chicken\n& couscous")
                .font(.title2.weight(.semibold))
                .foregroundStyle(QuietPalette.ink)
            Text("25 min · 2 servings")
                .font(.caption)
                .foregroundStyle(QuietPalette.muted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .background(QuietPalette.hero, in: RoundedRectangle(cornerRadius: 20))
        .padding(.top, 20)
    }

    private var groceriesRow: some View {
        HStack(spacing: 14) {
            Image(systemName: "basket")
                .foregroundStyle(QuietPalette.accent)
            VStack(alignment: .leading, spacing: 2) {
                Text("Groceries")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(QuietPalette.ink)
                Text("4 things to pick up")
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(QuietPalette.muted)
        }
        .frame(minHeight: 64)
        .padding(.horizontal, 14)
        .background(.white, in: RoundedRectangle(cornerRadius: 14))
        .padding(.top, 16)
    }

    private var comingUp: some View {
        VStack(alignment: .leading, spacing: 8) {
            SpikeSectionTitle(text: "Coming up")
            Text("Home insurance renewal")
                .font(.subheadline)
                .foregroundStyle(QuietPalette.ink)
            Text("In 5 days · reminder set")
                .font(.caption)
                .foregroundStyle(QuietPalette.muted)
        }
    }

    private var assistantButton: some View {
        Label("Ask your assistant", systemImage: "bubble.left")
            .font(.subheadline)
            .foregroundStyle(QuietPalette.accent)
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(.white, in: RoundedRectangle(cornerRadius: 14))
            .padding(.top, 18)
    }
}
