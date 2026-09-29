import SwiftUI
import UIKit

@MainActor
final class NotificationPresentationAvailability {
    weak var view: UIView?

    var canPresent: Bool {
        guard let root = view?.window?.rootViewController else { return false }
        return root.presentedViewController == nil && !root.isBeingDismissed && !root.isBeingPresented
    }
}

struct NotificationPresentationProbe: UIViewRepresentable {
    let availability: NotificationPresentationAvailability

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        availability.view = view
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}
