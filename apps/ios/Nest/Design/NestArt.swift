import SwiftUI

/// Nest's mark: two birds in a nest, one in each member's colour. Decorative only.
struct NestArt: View {
    var width: CGFloat = 180
    var animated = true
    var left: Color?
    var right: Color?
    @Environment(\.memberPalette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 30, paused: !animated || reduceMotion)) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                context.scaleBy(x: size.width / 220, y: size.height / 150)
                let bob = animated && !reduceMotion
                NestArtDrawing.draw(
                    in: &context,
                    left: left ?? palette.color(palette.me).color,
                    right: right ?? (palette.partner.map { palette.color($0).color } ?? MemberColor.clay.color),
                    leftLift: bob ? CGFloat(sin(t * 2)) * 3 : 0,
                    rightLift: bob ? CGFloat(sin(t * 2 + 1)) * 3 : 0)
            }
        }
        .frame(width: width, height: width * 150 / 220)
        .accessibilityHidden(true)
    }
}

enum NestArtDrawing {
    static let straw = Color(uiColor: UIColor(hex: 0xCBA46C))
    static let strawDark = Color(uiColor: UIColor(hex: 0xAD8350))
    static let strawLight = Color(uiColor: UIColor(hex: 0xE3C891))
    static let hollow = Color(uiColor: UIColor(hex: 0x8A643A))
    static let beak = Color(uiColor: UIColor(hex: 0xF2B443))
    static let eye = Color(uiColor: UIColor(hex: 0x1C2520))

    static func draw(
        in context: inout GraphicsContext, left: Color, right: Color, leftLift: CGFloat, rightLift: CGFloat
    ) {
        context.fill(Path(ellipseIn: CGRect(x: 38, y: 136, width: 144, height: 10)), with: .color(.black.opacity(0.07)))
        context.fill(Path(ellipseIn: CGRect(x: 30, y: 69, width: 160, height: 34)), with: .color(hollow))
        context.stroke(
            SVGPath.path("M32 85c18-17 138-17 156 0"), with: .color(Color(uiColor: UIColor(hex: 0xC39A62))),
            style: StrokeStyle(lineWidth: 7, lineCap: .round))
        var leftBird = context
        leftBird.translateBy(x: 0, y: -leftLift)
        bird(in: &leftBird, color: left, facingRight: true)
        var rightBird = context
        rightBird.translateBy(x: 0, y: -rightLift)
        bird(in: &rightBird, color: right, facingRight: false)
        nestFront(in: &context)
    }

    private static func bird(in context: inout GraphicsContext, color: Color, facingRight: Bool) {
        if !facingRight {
            context.translateBy(x: 220, y: 0)
            context.scaleBy(x: -1, y: 1)
        }
        let shade = GraphicsContext.Shading.color(color.mix(with: .black, by: 0.22))
        context.fill(SVGPath.path("M58 72l-15-11 4 18z"), with: shade)
        context.fill(Path(ellipseIn: CGRect(x: 53, y: 45, width: 62, height: 58)), with: .color(color))
        context.fill(SVGPath.path("M66 76c10-11 25-9 31 2-9 9-23 9-31-2z"), with: shade)
        context.fill(
            Path(ellipseIn: CGRect(x: 96, y: 70, width: 10, height: 10)),
            with: .color(Color(uiColor: UIColor(hex: 0xFF8F7A)).opacity(0.35)))
        context.fill(Path(ellipseIn: CGRect(x: 93.4, y: 59.4, width: 7.2, height: 7.2)), with: .color(eye))
        context.fill(Path(ellipseIn: CGRect(x: 97.2, y: 60.7, width: 2.2, height: 2.2)), with: .color(.white))
        context.fill(SVGPath.path("M112 62l11 3.6-11 4.4z"), with: .color(beak))
        context.stroke(
            SVGPath.path("M78 46c1-7 7-10 12-9"), with: .color(color), style: StrokeStyle(lineWidth: 4, lineCap: .round)
        )
    }

    private static func nestFront(in context: inout GraphicsContext) {
        context.fill(
            SVGPath.path("M26 84c4 34 40 50 84 50s80-16 84-50c-22 12-60 13-84 13s-62-1-84-13z"), with: .color(straw))
        let edge = StrokeStyle(lineWidth: 3.5, lineCap: .round)
        context.stroke(
            SVGPath.path("M26 84c22 12 60 13 84 13s62-1 84-13"), with: .color(Color(uiColor: UIColor(hex: 0xDFBF86))),
            style: edge)
        let weave = StrokeStyle(lineWidth: 2.6, lineCap: .round)
        for d in [
            "M36 101c24 13 124 13 148 0", "M46 113c22 11 106 11 128 0", "M62 124c18 6 78 6 96 0",
            "M58 104l10 9", "M96 107l8 10", "M138 106l-9 10", "M170 100l-8 9",
        ] {
            context.stroke(SVGPath.path(d), with: .color(strawDark.opacity(0.8)), style: weave)
        }
        let light = StrokeStyle(lineWidth: 2, lineCap: .round)
        for d in ["M40 95c26 10 114 10 140 0", "M52 118c18 6 34 8 48 8", "M128 119c14-1 28-4 38-9"] {
            context.stroke(SVGPath.path(d), with: .color(strawLight), style: light)
        }
        context.fill(
            SVGPath.path("M182 86c8-8 20-9 28-4-7 7-18 9-28 4z"), with: .color(Color(uiColor: UIColor(hex: 0x7FAE7C))))
        context.stroke(
            SVGPath.path("M177 90c7-3 13-7 18-12"), with: .color(Color(uiColor: UIColor(hex: 0x6D9A69))),
            style: StrokeStyle(lineWidth: 2, lineCap: .round))
    }
}
