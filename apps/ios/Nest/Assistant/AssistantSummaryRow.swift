import SwiftUI

struct AssistantSummaryRow: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember
    let summary: AssistantSummaryLink

    var body: some View {
        switch summary {
        case .none: Text("No daily summary has been saved for you yet.")
        case .saved(let snapshot):
            NavigationLink {
                DailySummaryScreen(session: session, member: member, summaryId: snapshot.summaryId)
                    .id(session.generation)
            } label: {
                QuietActionLabel("View saved summary for \(snapshot.summary.date.value)")
            }
        }
    }
}
