import SwiftUI

@main
struct ToolbarProbe: App {
    var body: some Scene { WindowGroup { ProbeForm() } }
}

struct ProbeForm: View {
    @State private var text = ""
    @FocusState private var focused: Bool
    var body: some View {
        TabView {
            NavigationStack {
                Form {
                    Section("Expense") {
                        TextField("Description", text: $text, axis: .vertical).focused($focused)
                    }
                }
                .navigationTitle("Toolbar probe")
                .task {
                    try? await Task.sleep(for: .seconds(2))
                    focused = true
                    try? await Task.sleep(for: .seconds(2))
                    focused = false
                }
            }.tabItem { Label("Money", systemImage: "creditcard") }
        }
    }
}
