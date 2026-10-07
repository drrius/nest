import SwiftUI

struct DiagnosticsScreen: View {
    @State private var report = ""

    var body: some View {
        List {
            Section {
                Text("Recent requests on this device")
                    .font(.headline)
                Text(
                    "Share this report when something does not work. It contains request references, timing, status and the app build. It does not include your account, messages, calendar details or expenses."
                )
                .font(.subheadline).foregroundStyle(QuietPalette.muted)
                Text("This report includes up to 128 requests from the current app session. Sharing is your choice.")
                    .font(.footnote).foregroundStyle(QuietPalette.muted)
            }
            Section {
                ShareLink(item: report) {
                    Label("Share diagnostic report", systemImage: "square.and.arrow.up")
                }.disabled(report.isEmpty)
                Button("Refresh report") { refresh() }
            }
        }
        .navigationTitle("Diagnostics")
        .scrollContentBackground(.hidden).background(QuietPalette.background)
        .onAppear { refresh() }
    }

    private func refresh() {
        report = (try? NestRequestDiagnostics.shared.supportReport()) ?? ""
    }
}
