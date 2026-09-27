import SwiftUI

@main
struct QuietSpikeApp: App {
    var body: some Scene {
        WindowGroup {
            TabView {
                QuietTodayView()
                    .tabItem { Label("Today", systemImage: "house") }
                QuietMealsView()
                    .tabItem { Label("Meals", systemImage: "fork.knife") }
                QuietCalendarView()
                    .tabItem { Label("Calendar", systemImage: "calendar") }
                QuietMoneyView()
                    .tabItem { Label("Money", systemImage: "creditcard") }
            }
            .tint(QuietPalette.accent)
        }
    }
}

enum QuietPalette {
    static let background = Color(red: 250 / 255, green: 251 / 255, blue: 247 / 255)
    static let ink = Color(red: 39 / 255, green: 58 / 255, blue: 49 / 255)
    static let muted = Color(red: 100 / 255, green: 110 / 255, blue: 101 / 255)
    static let accent = Color(red: 51 / 255, green: 93 / 255, blue: 73 / 255)
    static let soft = Color(red: 234 / 255, green: 240 / 255, blue: 230 / 255)
    static let hero = Color(red: 233 / 255, green: 239 / 255, blue: 223 / 255)
    static let line = Color(red: 219 / 255, green: 226 / 255, blue: 217 / 255)
}

struct SpikeHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(eyebrow)
                    .font(.caption)
                    .foregroundStyle(QuietPalette.muted)
                Spacer()
                Text("JL")
                    .font(.caption)
                    .frame(width: 36, height: 36)
                    .background(.white, in: Circle())
                    .accessibilityLabel("Prototype profile")
            }
            Text(title)
                .font(.system(.largeTitle, design: .default, weight: .semibold))
                .tracking(-0.8)
                .foregroundStyle(QuietPalette.ink)
            Text(subtitle)
                .font(.subheadline)
                .foregroundStyle(QuietPalette.muted)
        }
    }
}

struct SpikeLabel: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2)
            .foregroundStyle(QuietPalette.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.top, 8)
    }
}

struct SpikeSectionTitle: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.headline)
            .foregroundStyle(QuietPalette.ink)
            .padding(.top, 22)
    }
}

struct SpikeSecondaryScreen: View {
    let title: String
    let subtitle: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                SpikeLabel(text: "Design study · fictional data")
                SpikeHeader(eyebrow: "Our household", title: title, subtitle: subtitle)
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 30)
        }
        .background(QuietPalette.background)
    }
}

struct QuietMealsView: View {
    var body: some View {
        SpikeSecondaryScreen(title: "Meals", subtitle: "Good food. One less daily decision.")
    }
}

struct QuietCalendarView: View {
    var body: some View {
        SpikeSecondaryScreen(title: "Calendar", subtitle: "The shape of your day, together.")
    }
}
