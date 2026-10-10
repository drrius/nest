import SwiftUI

struct TodayHeader: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let moment: TodayMoment

    var body: some View {
        QuietTabHeader(
            title: "Today", subtitle: "A good day to keep it simple.",
            session: model, member: member, contextLabel: moment.header)
    }
}
