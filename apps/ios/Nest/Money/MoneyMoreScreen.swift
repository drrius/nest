import SwiftUI

/// Less common money records: all financial approvals and drafts carried over from earlier versions.
struct MoneyMoreScreen: View {
    @ObservedObject var session: SessionModel
    let member: VerifiedMember

    var body: some View {
        List {
            Section {
                NavigationLink("Your financial approvals") {
                    FinancialApprovalsScreen(session: session, member: member).id(session.generation)
                }
                NavigationLink("Bills to confirm") {
                    RecurringRulesScreen(session: session, member: member, dueOnly: true).id(session.generation)
                }
            }
            Section {
                SavedVariableBillLink(session: session, member: member)
                NavigationLink("Draft dismissal") {
                    LegacyDismissalScreen(session: session, member: member, draftId: nil).id(session.generation)
                }
                NavigationLink("Draft confirmation") {
                    LegacyConfirmationScreen(session: session, member: member, draftId: nil).id(session.generation)
                }
                NavigationLink("Rule adoption") {
                    LegacyAdoptionScreen(session: session, member: member, ruleId: nil).id(session.generation)
                }
            } header: {
                Text("Saved changes")
            } footer: {
                Text("Records from earlier versions stay explainable. Nothing here changes your balance on its own.")
            }
        }
        .scrollContentBackground(.hidden)
        .nestScreen()
        .navigationTitle("Older saved changes")
        .navigationBarTitleDisplayMode(.inline)
    }
}
