import SwiftUI

enum QuietPalette {
    // Mapped onto the redesign's palette so screens not yet rebuilt already match (see NestColor).
    static let background = adaptive(0xF6F4EE, 0x111512)
    static let surface = adaptive(0xFFFFFF, 0x1B201C)
    static let onAccent = adaptive(0xF7F5EF, 0x0F1A14)
    static let ink = adaptive(0x1C2520, 0xEDF0EA)
    static let muted = adaptive(0x5F675F, 0xA2AAA2)
    static let accent = adaptive(0x2D5A43, 0x8FCAA6)
    static let soft = adaptive(0xE2EBE1, 0x1F3328)
    static let border = adaptive(0xE4E1D8, 0x2C332D)

    private static func adaptive(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(
            uiColor: UIColor { traits in
                let value = traits.userInterfaceStyle == .dark ? dark : light
                return UIColor(
                    red: CGFloat((value >> 16) & 0xFF) / 255,
                    green: CGFloat((value >> 8) & 0xFF) / 255,
                    blue: CGFloat(value & 0xFF) / 255,
                    alpha: 1
                )
            })
    }
}
