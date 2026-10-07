import SwiftUI

@main
struct NativeContrastProbe: App {
  private let withoutTabs = ProcessInfo.processInfo.arguments.contains("--without-tabs")

  var body: some Scene {
    WindowGroup {
      if withoutTabs {
        content
      } else {
        TabView {
          content.tabItem { Label("Calendar", systemImage: "calendar") }
          Text("Control").tabItem { Label("Other", systemImage: "house") }
        }
      }
    }
  }

  private var content: some View {
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          ForEach(1..<9) { index in
            VStack(alignment: .leading, spacing: 12) {
              Text("Section \(index)").font(.headline)
              Text(
                "Paragraph \(index). Standard system text stays on this device. It contains no personal calendar information."
              )
              .font(.body).foregroundStyle(.secondary)
            }
            .padding(20)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
              Color(uiColor: .secondarySystemGroupedBackground),
              in: RoundedRectangle(cornerRadius: 20))
          }
        }
        .padding(20)
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle("Native probe")
      .navigationBarTitleDisplayMode(.inline)
    }
  }
}
