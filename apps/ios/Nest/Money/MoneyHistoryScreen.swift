import SwiftUI

struct MoneyHistoryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    @State private var refresh = UUID()

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                MoneyHistorySection(session: session, member: member, refresh: refresh)
            }
            .padding(20)
        }
        .refreshable { refresh = UUID() }
        .buttonStyle(.plain)
        .background(QuietPalette.background)
        .navigationTitle("Financial history")
    }
}
