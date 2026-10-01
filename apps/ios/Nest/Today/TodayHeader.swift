import SwiftUI

struct TodayHeader: View {
    @ObservedObject var model: SessionModel
    let member: VerifiedMember
    let moment: TodayMoment
    @Environment(\.dynamicTypeSize) private var textSize

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if textSize.isAccessibilitySize {
                date
                HStack {
                    title
                    Spacer(minLength: 8)
                    actions
                }.padding(.top, 8)
            } else {
                HStack {
                    date
                    Spacer()
                    actions
                }
                title.padding(.top, 4)
            }
            Text("A good day to keep it simple.")
                .font(.subheadline)
                .foregroundStyle(QuietPalette.muted)
                .padding(.top, 3)
        }
    }

    private var date: some View {
        Text(moment.header)
            .font(.caption)
            .foregroundStyle(QuietPalette.muted)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var title: some View {
        Text("Today")
            .font(.largeTitle.weight(.semibold))
            .foregroundStyle(QuietPalette.ink)
    }

    private var actions: some View {
        HStack(spacing: 8) {
            AssistantEntry(session: model, member: member)
            NavigationLink {
                ProfileScreen(model: model, member: member)
            } label: {
                Image(systemName: "person.crop.circle")
                    .font(.title2)
                    .foregroundStyle(QuietPalette.accent)
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Profile and preferences")
        }
    }
}
