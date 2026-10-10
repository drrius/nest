import SwiftUI

/// Nest's mark: two birds in a nest. Image-generated artwork, decorative only.
struct NestArt: View {
    var width: CGFloat = 180
    var animated = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let art = Image("NestMark").resizable().scaledToFit().frame(width: width).accessibilityHidden(true)
        if animated && !reduceMotion {
            // The phase animator moves only the offset, so the art never drifts from its laid-out position.
            art.phaseAnimator([false, true]) { content, lifted in
                content.offset(y: lifted ? -2 : 0)
            } animation: { _ in
                .easeInOut(duration: 2)
            }
        } else {
            art
        }
    }
}
