import SwiftUI

struct QuietDraftBack: ViewModifier {
    let hasChanges: Bool
    let busy: Bool
    let confirm: () -> Void

    func body(content: Content) -> some View {
        content
            .navigationBarBackButtonHidden(hasChanges || busy)
            .interactiveDismissDisabled(hasChanges || busy)
            .toolbar {
                if hasChanges {
                    ToolbarItem(placement: .topBarLeading) {
                        QuietToolbarButton("Back", systemImage: "chevron.left", action: confirm)
                            .disabled(busy)
                    }
                }
            }
    }
}
