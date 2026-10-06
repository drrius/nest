import SwiftUI

enum QuietTabLayout {
    static let horizontalInset: CGFloat = 20
    static let topInset: CGFloat = 14
    static let sectionSpacing: CGFloat = 24
}

struct QuietTabContentInsets: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(.horizontal, QuietTabLayout.horizontalInset)
            .padding(.top, QuietTabLayout.topInset)
            .padding(.bottom, QuietTabLayout.sectionSpacing)
    }
}

struct QuietTabScrollEdges: ViewModifier {
    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 26, *) {
            content.scrollEdgeEffectHidden(true, for: .bottom)
        } else {
            content
        }
    }
}
