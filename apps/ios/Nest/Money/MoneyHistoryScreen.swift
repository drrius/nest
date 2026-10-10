import SwiftUI

struct MoneyHistoryScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                MoneyHistorySection(session: session, member: member)
            }
            .padding(20)
        }
        .buttonStyle(.plain)
        .background(QuietPalette.background)
        .navigationTitle("Financial history")
    }
}
