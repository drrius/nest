import SwiftUI

struct QuietDiscardBack: ViewModifier {
    let hasChanges: Bool
    let busy: Bool
    let endEditing: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var discard = false

    func body(content: Content) -> some View {
        content
            .modifier(
                QuietDraftBack(hasChanges: hasChanges, busy: busy) {
                    endEditing()
                    discard = true
                }
            )
            .alert("Discard edits?", isPresented: $discard) {
                Button("Discard edits", role: .destructive) { dismiss() }
                Button("Keep editing", role: .cancel) {}
            }
    }
}
