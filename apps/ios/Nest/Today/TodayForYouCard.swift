import SwiftUI

/// A compact card for things that need you today: requests, bills, approvals. Hidden when empty.
struct TodayForYouCard<Accessory: View, Content: View>: View {
    let title: String
    var systemImage: String?
    @ViewBuilder var accessory: Accessory
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage).imageScale(.small) }
                Text(title)
                Spacer()
                accessory.fontWeight(.semibold).foregroundStyle(NestColor.accentInk)
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(NestColor.ink2)
            .padding(.horizontal, 16)
            .padding(.top, 14)
            .padding(.bottom, 4)
            content
        }
        .nestCard(padding: 0)
        .padding(.bottom, 0)
    }
}

struct TodayForYouRow: View {
    let icon: String
    let domain: NestDomain
    let title: String
    let detail: String

    var body: some View {
        HStack(spacing: 12) {
            IconTile(systemName: icon, domain: domain, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).foregroundStyle(NestColor.ink).multilineTextAlignment(.leading)
                Text(detail).font(.footnote).foregroundStyle(NestColor.ink2)
            }
            Spacer(minLength: 8)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold))
                .foregroundStyle(NestColor.ink3).accessibilityHidden(true)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityHint(detail)
    }
}

struct TodayForYouRetry: View {
    let text: String
    let retry: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "exclamationmark.circle").foregroundStyle(NestColor.warn)
            Text(text).font(.subheadline).foregroundStyle(NestColor.ink2)
            Spacer()
            Button("Try again", action: retry).font(.subheadline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .frame(minHeight: 52)
        .nestCard(padding: 0)
    }
}
